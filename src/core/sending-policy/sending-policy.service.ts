import { Database } from 'bun:sqlite';
import pino from 'pino';
import { injectable } from 'tsyringe';
import { BadRequestException, TooManyRequestsException } from '../../core/exceptions';

const logger = pino({ name: 'SendingPolicyService' });

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/**
 * Per-session sending policy configuration. Every field is optional so a
 * per-session override can set only what it wants to change; unset fields
 * fall back to the environment defaults.
 *
 * The same fields are accepted in the `policy` table JSON and in the
 * PUT /api/sessions/:session/policy body.
 */
export interface SendingPolicyConfig {
  maxPerMinute?: number;
  maxPerHour?: number;
  maxPerDay?: number;
  newChatsPerDay?: number;
  reachoutMinIntervalSeconds?: number;
  /** Warm-up ramp length in days (default 14). */
  warmupDays?: number;
  /** Warm-up floor as a percent of the caps (default 20). */
  warmupFloorPercent?: number;
  /** 'HH:MM-HH:MM' local-time window, '' disables. */
  quietHours?: string;
  /** Master switch, mirrors SEND_POLICY_ENABLED for a single session. */
  enabled?: boolean;
}

export interface SendingPolicyEffectiveConfig {
  maxPerMinute: number;
  maxPerHour: number;
  maxPerDay: number;
  newChatsPerDay: number;
  reachoutMinIntervalSeconds: number;
  warmupDays: number;
  warmupFloorPercent: number;
  quietHours: string;
  enabled: boolean;
}

export interface SendingPolicyUsage {
  counts: {
    lastMinute: number;
    lastHour: number;
    lastDay: number;
    newChatsLastDay: number;
  };
  effective: SendingPolicyEffectiveConfig;
  warmup: {
    firstSeenAt: string | null;
    ageDays: number;
    factor: number;
  };
  /** null means the constraint is not currently blocking. */
  nextAllowedAt: {
    minuteCap: string | null;
    hourCap: string | null;
    dayCap: string | null;
    newChatsPerDay: string | null;
    reachout: string | null;
    quietHours: string | null;
  };
}

function envInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const value = raw.toLowerCase();
  if (value === 'false' || value === '0' || value === 'no' || value === 'off') {
    return false;
  }
  return true;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 'HH:MM-HH:MM' → minutes-since-midnight window, null when unset/malformed. */
export function parseQuietHours(value?: string | null): {
  start: number;
  end: number;
} | null {
  if (!value || !value.trim()) {
    return null;
  }
  const match = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const start = Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10);
  const end = Number.parseInt(match[3], 10) * 60 + Number.parseInt(match[4], 10);
  if (start > 24 * 60 || end > 24 * 60) {
    return null;
  }
  return { start, end };
}

/**
 * Milliseconds until the quiet-hours window ends, 0 when the window is off
 * or `now` is outside it. Windows may wrap midnight (start > end).
 */
export function quietHoursRemainingMs(value: string | undefined, now: number): number {
  const window = parseQuietHours(value);
  if (!window) {
    return 0;
  }
  const date = new Date(now);
  const nowMinutes = date.getHours() * 60 + date.getMinutes();
  const inWindow =
    window.start <= window.end
      ? nowMinutes >= window.start && nowMinutes < window.end
      : nowMinutes >= window.start || nowMinutes < window.end;
  if (!inWindow) {
    return 0;
  }
  const endDate = new Date(now);
  endDate.setHours(Math.floor(window.end / 60), window.end % 60, 0, 0);
  let endMs = endDate.getTime();
  if (endMs <= now) {
    // The window ends tomorrow (wrapped or already past the end today).
    endMs += DAY_MS;
  }
  return endMs - now;
}

/**
 * Fraction of the caps a session may use given its age. Day 0 sits at the
 * floor (20% by default) and ramps linearly to 100% over warmupDays (14).
 */
export function warmupFactor(
  now: number,
  firstSeenAtMs: number | null,
  config: { warmupDays?: number; warmupFloorPercent?: number },
): number {
  const rampDays = clamp(config.warmupDays ?? 14, 1, 365);
  const floor = clamp((config.warmupFloorPercent ?? 20) / 100, 0.01, 1);
  if (firstSeenAtMs === null) {
    return 1;
  }
  const ageDays = Math.max(0, (now - firstSeenAtMs) / DAY_MS);
  const progress = Math.min(1, ageDays / rampDays);
  return floor + (1 - floor) * progress;
}

/**
 * Anti-ban sending policy, ported from the WAHA "Message Capping & Reachout
 * Timelock" feature set. Every outbound message funnel (REST, bulk, MCP) is
 * gated through assertSendAllowed() at the engine's send methods.
 *
 * Storage mirrors AuditService: bun:sqlite at
 * `${WAHA_STORAGE_DIR or ./data}/sending-limits.db` in WAL mode, directory
 * auto-created.
 *
 * Configurable via environment variables (all overridable per session in the
 * `policy` table, which takes precedence):
 *   SEND_POLICY_ENABLED           — global off-switch (default true)
 *   SEND_POLICY_BYPASS_SESSIONS   — comma-separated session names to never gate
 *   SEND_MAX_PER_MINUTE           — per-minute cap (default 20)
 *   SEND_MAX_PER_HOUR             — per-hour cap (default 200)
 *   SEND_MAX_PER_DAY              — per-day cap (default 1000)
 *   REACHOUT_MIN_INTERVAL_SECONDS — minimum spacing between cold outreaches (default 60)
 *   NEW_CHATS_PER_DAY             — first-time chats per day (default 100)
 *   SEND_QUIET_HOURS              — 'HH:MM-HH:MM' local window, empty = off
 *   SEND_WARMUP_DAYS              — ramp length (default 14)
 *   SEND_WARMUP_FLOOR_PERCENT     — floor percent of the caps (default 20)
 *
 * Recording semantics: successful sends always record a row (caps). A FAILED
 * send records a row only when the chat was new, so an attempted cold
 * outreach still occupies the reachout timelock slot. Such rows also count
 * toward the caps, which is deliberately conservative.
 */

const OVERRIDE_FIELDS = [
  'maxPerMinute',
  'maxPerHour',
  'maxPerDay',
  'newChatsPerDay',
  'reachoutMinIntervalSeconds',
  'warmupDays',
  'warmupFloorPercent',
  'quietHours',
  'enabled',
] as const;

const NUMBER_FIELDS: ReadonlySet<string> = new Set([
  'maxPerMinute',
  'maxPerHour',
  'maxPerDay',
  'newChatsPerDay',
  'reachoutMinIntervalSeconds',
  'warmupDays',
  'warmupFloorPercent',
]);

/**
 * Validate and normalize a per-session policy override body. Shared by the
 * REST PUT route and the SendingPolicySet MCP tool. Throws
 * BadRequestException on unknown or malformed fields.
 */
export function parseOverrides(body: any): SendingPolicyConfig {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequestException('Body must be a JSON object with policy overrides');
  }
  const overrides: SendingPolicyConfig = {};
  for (const [key, value] of Object.entries(body)) {
    if (!OVERRIDE_FIELDS.includes(key as any)) {
      throw new BadRequestException(`Unknown policy field '${key}'`);
    }
    if (value === null) {
      continue;
    }
    if (NUMBER_FIELDS.has(key)) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new BadRequestException(`Field '${key}' must be a non-negative number`);
      }
      (overrides as any)[key] = value;
      continue;
    }
    if (key === 'quietHours') {
      if (typeof value !== 'string') {
        throw new BadRequestException("Field 'quietHours' must be a 'HH:MM-HH:MM' string or ''");
      }
      const trimmed = value.trim();
      if (trimmed && !parseQuietHours(trimmed)) {
        throw new BadRequestException(
          "Field 'quietHours' must be a 'HH:MM-HH:MM' string or ''",
        );
      }
      overrides.quietHours = trimmed;
      continue;
    }
    if (key === 'enabled') {
      if (typeof value !== 'boolean') {
        throw new BadRequestException("Field 'enabled' must be a boolean");
      }
      overrides.enabled = value;
      continue;
    }
  }
  return overrides;
}

@injectable()
export class SendingPolicyService {
  private db: Database;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private shutdown = false;
  private clock: () => number;

  constructor(dbOrPath?: Database | string, clock: () => number = () => Date.now()) {
    this.clock = clock;
    if (typeof dbOrPath === 'string') {
      this.db = new Database(`${dbOrPath}/sending-limits.db`);
    } else if (dbOrPath instanceof Database) {
      this.db = dbOrPath;
    } else {
      const storageDir = process.env.WAHA_STORAGE_DIR ?? './data';
      // Auto-create the storage dir so fresh clones boot without a manual mkdir
      const { mkdirSync } = require('fs');
      mkdirSync(storageDir, { recursive: true });
      this.db = new Database(`${storageDir}/sending-limits.db`);
    }

    this.db.run('PRAGMA journal_mode = WAL');
    this.initSchema();
    this.startCleanup();
  }

  private initSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sends (
        session TEXT NOT NULL,
        chatId TEXT NOT NULL,
        ts INTEGER NOT NULL,
        isNew INTEGER NOT NULL DEFAULT 0
      )
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS policy (
        session TEXT PRIMARY KEY,
        json TEXT NOT NULL
      )
    `);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_sends_session_ts ON sends(session, ts)`);
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_sends_session_chat ON sends(session, chatId, ts)`,
    );
  }

  private startCleanup(): void {
    const runCleanup = (): void => {
      try {
        // Sends older than two days no longer affect any window (the largest
        // is the daily cap), so prune them to keep the table small.
        const removed = this.db
          .run(`DELETE FROM sends WHERE ts < ?`, [this.clock() - 2 * DAY_MS])
          .changes;
        if (removed > 0) {
          logger.debug(`Pruned ${removed} old send record(s) from the sending policy`);
        }
      } catch (err) {
        logger.error({ err: String(err) }, 'Sending-policy cleanup failed');
      }
    };

    runCleanup();
    this.cleanupTimer = setInterval(runCleanup, 24 * 60 * 60 * 1000);
    this.cleanupTimer.unref?.();
  }

  // ===== Configuration =====

  private bypassedSessions(): string[] {
    return (process.env.SEND_POLICY_BYPASS_SESSIONS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  public isBypassed(session: string): boolean {
    return this.bypassedSessions().includes(session);
  }

  private envDefaults(): SendingPolicyEffectiveConfig {
    return {
      maxPerMinute: envInt('SEND_MAX_PER_MINUTE', 20),
      maxPerHour: envInt('SEND_MAX_PER_HOUR', 200),
      maxPerDay: envInt('SEND_MAX_PER_DAY', 1000),
      newChatsPerDay: envInt('NEW_CHATS_PER_DAY', 100),
      reachoutMinIntervalSeconds: envInt('REACHOUT_MIN_INTERVAL_SECONDS', 60),
      warmupDays: envInt('SEND_WARMUP_DAYS', 14),
      warmupFloorPercent: envInt('SEND_WARMUP_FLOOR_PERCENT', 20),
      quietHours: process.env.SEND_QUIET_HOURS ?? '',
      enabled: envBool('SEND_POLICY_ENABLED', true),
    };
  }

  /** Per-session overrides stored in the policy table (JSON, same fields). */
  public getOverrides(session: string): SendingPolicyConfig {
    const row = this.db
      .query(`SELECT json FROM policy WHERE session = ?`)
      .get(session) as { json: string } | null;
    if (!row?.json) {
      return {};
    }
    try {
      const parsed = JSON.parse(row.json);
      // firstSeenAtMs is bookkeeping, not a config override
      delete parsed.firstSeenAtMs;
      return parsed as SendingPolicyConfig;
    } catch {
      logger.warn({ session }, 'Malformed sending-policy JSON, ignoring overrides');
      return {};
    }
  }

  public setOverrides(session: string, overrides: SendingPolicyConfig): void {
    const existing = this.getFirstSeen(session);
    const json = JSON.stringify({ ...overrides, firstSeenAtMs: existing });
    this.db.run(
      `INSERT INTO policy (session, json) VALUES (?, ?)
       ON CONFLICT(session) DO UPDATE SET json = excluded.json`,
      [session, json],
    );
  }

  /** Env defaults merged with the per-session overrides (overrides win). */
  public resolveConfig(session: string): SendingPolicyEffectiveConfig {
    const defaults = this.envDefaults();
    const overrides = this.getOverrides(session);
    const merged: SendingPolicyEffectiveConfig = { ...defaults };
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined || value === null) continue;
      (merged as any)[key] = value;
    }
    return merged;
  }

  // ===== First-seen tracking (warm-up ramp) =====

  private getFirstSeen(session: string): number | null {
    const row = this.db
      .query(`SELECT json FROM policy WHERE session = ?`)
      .get(session) as { json: string } | null;
    if (!row?.json) {
      return null;
    }
    try {
      const parsed = JSON.parse(row.json);
      return typeof parsed.firstSeenAtMs === 'number' ? parsed.firstSeenAtMs : null;
    } catch {
      return null;
    }
  }

  /** Record the session's first-seen date once; returns it afterwards. */
  private ensureFirstSeen(session: string, now: number): number {
    const row = this.db
      .query(`SELECT json FROM policy WHERE session = ?`)
      .get(session) as { json: string } | null;
    let parsed: any = {};
    if (row?.json) {
      try {
        parsed = JSON.parse(row.json);
      } catch {
        parsed = {};
      }
    }
    if (typeof parsed.firstSeenAtMs === 'number') {
      return parsed.firstSeenAtMs;
    }
    // Merge so an existing override row keeps its overrides
    parsed.firstSeenAtMs = now;
    this.db.run(
      `INSERT INTO policy (session, json) VALUES (?, ?)
       ON CONFLICT(session) DO UPDATE SET json = excluded.json`,
      [session, JSON.stringify(parsed)],
    );
    return now;
  }

  // ===== Checks =====

  private countSince(session: string, sinceMs: number): number {
    const row = this.db
      .query(`SELECT COUNT(*) as count FROM sends WHERE session = ? AND ts > ?`)
      .get(session, sinceMs) as { count: number };
    return row?.count ?? 0;
  }

  private oldestSince(session: string, sinceMs: number): number | null {
    const row = this.db
      .query(`SELECT MIN(ts) as ts FROM sends WHERE session = ? AND ts > ?`)
      .get(session, sinceMs) as { ts: number | null };
    return row?.ts ?? null;
  }

  private lastNewChatAt(session: string): number | null {
    const row = this.db
      .query(`SELECT MAX(ts) as ts FROM sends WHERE session = ? AND isNew = 1`)
      .get(session) as { ts: number | null };
    return row?.ts ?? null;
  }

  private distinctNewChatsSince(session: string, sinceMs: number): number {
    const row = this.db
      .query(
        `SELECT COUNT(DISTINCT chatId) as count FROM sends WHERE session = ? AND isNew = 1 AND ts > ?`,
      )
      .get(session, sinceMs) as { count: number };
    return row?.count ?? 0;
  }

  /** "Never written before" = no prior row for that chatId in the sends table. */
  public isNewChat(session: string, chatId: string): boolean {
    const row = this.db
      .query(`SELECT 1 as x FROM sends WHERE session = ? AND chatId = ? LIMIT 1`)
      .get(session, chatId);
    return !row;
  }

  /**
   * Gate a send. Resolves when the send is allowed, throws
   * TooManyRequestsException (with a retry-after hint) when a limit blocks it.
   */
  public assertSendAllowed(session: string, chatId: string): void {
    const config = this.resolveConfig(session);
    const now = this.clock();

    if (!config.enabled || this.isBypassed(session)) {
      return;
    }

    // First-seen drives the warm-up ramp; recording it here is idempotent.
    const firstSeenAtMs = this.ensureFirstSeen(session, now);
    const factor = warmupFactor(now, firstSeenAtMs, config);
    // A cap of 0 or less blocks all sends; otherwise the warm-up floor keeps
    // at least one send per window available.
    const scaled = (cap: number) => (cap <= 0 ? 0 : Math.max(1, Math.ceil(cap * factor)));

    // Quiet hours
    const quietMs = quietHoursRemainingMs(config.quietHours, now);
    if (quietMs > 0) {
      throw new TooManyRequestsException(
        quietMs,
        `Quiet hours are in effect (${config.quietHours})`,
      );
    }

    // Volume caps (sliding windows)
    const minuteWait = this.capWait(session, now, MINUTE_MS, scaled(config.maxPerMinute));
    if (minuteWait !== null) {
      throw new TooManyRequestsException(minuteWait, 'Per minute send cap reached');
    }
    const hourWait = this.capWait(session, now, HOUR_MS, scaled(config.maxPerHour));
    if (hourWait !== null) {
      throw new TooManyRequestsException(hourWait, 'Per hour send cap reached');
    }
    const dayWait = this.capWait(session, now, DAY_MS, scaled(config.maxPerDay));
    if (dayWait !== null) {
      throw new TooManyRequestsException(dayWait, 'Per day send cap reached');
    }

    // Cold-outreach controls only apply to chats the session never wrote to
    if (this.isNewChat(session, chatId)) {
      const newChats = this.distinctNewChatsSince(session, now - DAY_MS);
      const newChatCap = scaled(config.newChatsPerDay);
      if (newChats >= newChatCap) {
        const oldest = this.oldestNewChatSince(session, now - DAY_MS);
        const wait = oldest === null ? DAY_MS : oldest + DAY_MS - now;
        throw new TooManyRequestsException(
          wait,
          `New chats per day quota reached (${newChatCap})`,
        );
      }

      const lastCold = this.lastNewChatAt(session);
      if (lastCold !== null) {
        const intervalMs = Math.max(0, config.reachoutMinIntervalSeconds) * 1000;
        const wait = lastCold + intervalMs - now;
        if (wait > 0) {
          throw new TooManyRequestsException(
            wait,
            `Reachout timelock: wait ${Math.ceil(wait / 1000)}s between new chats`,
          );
        }
      }
    }
  }

  /** Retry-after for a sliding-window cap, null when under the limit. */
  private capWait(session: string, now: number, windowMs: number, limit: number): number | null {
    const count = this.countSince(session, now - windowMs);
    if (count < limit) {
      return null;
    }
    const oldest = this.oldestSince(session, now - windowMs);
    // When the oldest send leaves the window the count drops by one
    return oldest === null ? windowMs : oldest + windowMs - now;
  }

  private oldestNewChatSince(session: string, sinceMs: number): number | null {
    const row = this.db
      .query(
        `SELECT MIN(ts) as ts FROM sends WHERE session = ? AND isNew = 1 AND ts > ?`,
      )
      .get(session, sinceMs) as { ts: number | null };
    return row?.ts ?? null;
  }

  // ===== Recording =====

  /**
   * Record a send. Successes always record (they drive the caps). A failed
   * send records only when the chat was new, so an attempted cold outreach
   * still occupies the reachout timelock slot (such rows also count toward
   * the caps, which is conservative by design).
   */
  public recordSend(session: string, chatId: string, failed = false): void {
    this.ensureFirstSeen(session, this.clock());
    if (failed && !this.isNewChat(session, chatId)) {
      return;
    }
    const isNew = this.isNewChat(session, chatId) ? 1 : 0;
    this.db.run(
      `INSERT INTO sends (session, chatId, ts, isNew) VALUES (?, ?, ?, ?)`,
      [session, chatId, this.clock(), isNew],
    );
  }

  // ===== Introspection (REST surface) =====

  public getUsage(session: string): SendingPolicyUsage {
    const now = this.clock();
    const config = this.resolveConfig(session);
    const firstSeenAtMs = this.getFirstSeen(session);
    const factor = warmupFactor(now, firstSeenAtMs, config);
    const scaled = (cap: number) => Math.max(1, Math.ceil(cap * factor));

    const effective: SendingPolicyEffectiveConfig = {
      ...config,
      maxPerMinute: scaled(config.maxPerMinute),
      maxPerHour: scaled(config.maxPerHour),
      maxPerDay: scaled(config.maxPerDay),
      newChatsPerDay: scaled(config.newChatsPerDay),
    };

    const counts = {
      lastMinute: this.countSince(session, now - MINUTE_MS),
      lastHour: this.countSince(session, now - HOUR_MS),
      lastDay: this.countSince(session, now - DAY_MS),
      newChatsLastDay: this.distinctNewChatsSince(session, now - DAY_MS),
    };

    const toIso = (ms: number | null): string | null =>
      ms === null ? null : new Date(ms).toISOString();

    const capNext = (windowMs: number, limit: number, count: number): string | null => {
      if (count < limit) {
        return null;
      }
      const oldest = this.oldestSince(session, now - windowMs);
      return toIso(oldest === null ? now + windowMs : oldest + windowMs);
    };

    const lastCold = this.lastNewChatAt(session);
    const intervalMs = Math.max(0, config.reachoutMinIntervalSeconds) * 1000;
    const quietMs = quietHoursRemainingMs(config.quietHours, now);

    return {
      counts,
      effective,
      warmup: {
        firstSeenAt: firstSeenAtMs === null ? null : new Date(firstSeenAtMs).toISOString(),
        ageDays: firstSeenAtMs === null ? 0 : Math.max(0, (now - firstSeenAtMs) / DAY_MS),
        factor: Math.round(factor * 100) / 100,
      },
      nextAllowedAt: {
        minuteCap: capNext(MINUTE_MS, effective.maxPerMinute, counts.lastMinute),
        hourCap: capNext(HOUR_MS, effective.maxPerHour, counts.lastHour),
        dayCap: capNext(DAY_MS, effective.maxPerDay, counts.lastDay),
        newChatsPerDay:
          counts.newChatsLastDay >= effective.newChatsPerDay
            ? toIso((this.oldestNewChatSince(session, now - DAY_MS) ?? now) + DAY_MS)
            : null,
        reachout:
          lastCold !== null && lastCold + intervalMs > now ? toIso(lastCold + intervalMs) : null,
        quietHours: quietMs > 0 ? toIso(now + quietMs) : null,
      },
    };
  }

  /** Reset per-session state (sends + overrides). Used by tests and the API. */
  public resetSession(session: string): void {
    this.db.run(`DELETE FROM sends WHERE session = ?`, [session]);
    this.db.run(`DELETE FROM policy WHERE session = ?`, [session]);
  }

  destroy(): void {
    if (this.shutdown) return;
    this.shutdown = true;
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    try {
      this.db.close();
    } catch {
      // Already closed
    }
  }
}
