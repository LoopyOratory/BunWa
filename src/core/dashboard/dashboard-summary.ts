import type { AuditSessionCounts, AuditSummary } from '../audit/audit.service';
import { failureReasonLabel } from '../audit/failure-reason';
import type { SendingPolicyUsage } from '../sending-policy/sending-policy.service';
import type { StoreHealth } from '../storage/store-health';

/**
 * The ops dashboard's single answer: what every session is doing, how close
 * it is to its sending limits, what failed, which webhooks are failing, and a
 * short list of what needs attention now.
 *
 * `buildDashboardSummary` is pure: the route gathers the inputs (sessions,
 * policy usage, audit aggregates, store health) and this decides what they
 * mean, so the rules are unit-testable without a server.
 */

export const DASHBOARD_RANGES = {
  '1h': { ms: 60 * 60_000, bucketMs: 5 * 60_000 },
  '24h': { ms: 24 * 60 * 60_000, bucketMs: 60 * 60_000 },
  '7d': { ms: 7 * 24 * 60 * 60_000, bucketMs: 6 * 60 * 60_000 },
  '30d': { ms: 30 * 24 * 60 * 60_000, bucketMs: 24 * 60 * 60_000 },
} as const;
export type DashboardRangeKey = keyof typeof DASHBOARD_RANGES;

export function parseDashboardRange(value: string | undefined): DashboardRangeKey {
  return value && value in DASHBOARD_RANGES ? (value as DashboardRangeKey) : '24h';
}

/** Thresholds for the attention list. */
export const ATTENTION = {
  limitWarnRatio: 0.8,
  startingStuckMs: 2 * 60_000,
  webhookErrorCount: 5,
  failedWarnCount: 5,
} as const;

export interface DashboardSessionInput {
  name: string;
  engine: string;
  status: string;
  statusSince: number | null;
  lastActivityAt: number | null;
  account: { id: string; pushName?: string } | null;
  autoStart: boolean;
  /** Null when the session is bypassed or the policy is unavailable. */
  usage: SendingPolicyUsage | null;
  bypassed: boolean;
}

export interface LimitGauge {
  label: string;
  used: number;
  cap: number;
  ratio: number;
}

export interface DashboardSession {
  name: string;
  engine: string;
  status: string;
  statusSince: string | null;
  lastActivityAt: string | null;
  account: { id: string; pushName?: string } | null;
  autoStart: boolean;
  counts: AuditSessionCounts;
  limits: {
    enabled: boolean;
    nearest: LimitGauge | null;
    day: LimitGauge;
    newChats: LimitGauge;
    warmup: { ageDays: number; warmupDays: number; factor: number; done: boolean };
    quietHoursUntil: string | null;
  } | null;
}

export interface AttentionItem {
  id: string;
  severity: 'error' | 'warning';
  kind: 'session' | 'limit' | 'webhook' | 'sends';
  session: string | null;
  title: string;
  detail: string;
  action: 'qr' | 'start' | 'restart' | 'limits' | 'webhooks' | 'logs';
}

export interface DashboardSummary {
  generatedAt: string;
  range: { key: DashboardRangeKey; from: string; to: string; bucketMs: number };
  server: {
    version: string;
    tier: string;
    engine: string;
    uptimeSeconds: number;
    workers: number;
    store: StoreHealth;
  };
  sessions: DashboardSession[];
  attention: AttentionItem[];
  totals: AuditSessionCounts;
  series: AuditSummary['series'];
  failureReasons: Array<{ reason: string; count: number; lastAt: string; session: string | null; example: string | null }>;
  webhooks: {
    delivered: number;
    failed: number;
    failing: AuditSummary['webhookFailures'];
  };
}

export interface DashboardSummaryInput {
  now: number;
  range: DashboardRangeKey;
  server: { version: string; tier: string; engine: string; uptimeSeconds: number; store: StoreHealth };
  sessions: DashboardSessionInput[];
  /** Aggregates over the selected range. */
  audit: AuditSummary;
  /** Aggregates over the last hour, which drive the attention list. */
  recent: AuditSummary;
}

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
const gauge = (label: string, used: number, cap: number): LimitGauge => ({
  label,
  used,
  cap,
  ratio: cap > 0 ? used / cap : used > 0 ? 1 : 0,
});
const emptyCounts = (): AuditSessionCounts => ({
  sent: 0,
  failed: 0,
  refused: 0,
  webhookDelivered: 0,
  webhookFailed: 0,
});

function limitsFor(input: DashboardSessionInput): DashboardSession['limits'] {
  const usage = input.usage;
  if (!usage) return null;
  const { counts, effective, warmup, nextAllowedAt } = usage;
  const gauges = [
    gauge('per-minute cap', counts.lastMinute, effective.maxPerMinute),
    gauge('hourly cap', counts.lastHour, effective.maxPerHour),
    gauge('daily cap', counts.lastDay, effective.maxPerDay),
    gauge('new-chat quota', counts.newChatsLastDay, effective.newChatsPerDay),
  ];
  const enabled = effective.enabled && !input.bypassed;
  const nearest = enabled
    ? gauges.reduce((best, g) => (g.ratio > best.ratio ? g : best), gauges[0])
    : null;
  return {
    enabled,
    nearest,
    day: gauges[2],
    newChats: gauges[3],
    warmup: {
      ageDays: Math.round(warmup.ageDays * 10) / 10,
      warmupDays: effective.warmupDays,
      factor: warmup.factor,
      done: warmup.factor >= 1,
    },
    quietHoursUntil: nextAllowedAt.quietHours,
  };
}

function minutesAgo(now: number, since: number | null): string {
  if (since === null) return '';
  const minutes = Math.max(0, Math.round((now - since) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

function attentionFor(input: DashboardSummaryInput, sessions: DashboardSession[]): AttentionItem[] {
  const items: AttentionItem[] = [];
  const { now } = input;

  for (const session of input.sessions) {
    const since = minutesAgo(now, session.statusSince);
    if (session.status === 'SCAN_QR_CODE') {
      items.push({
        id: `qr:${session.name}`,
        severity: 'error',
        kind: 'session',
        session: session.name,
        title: `${session.name} needs a QR scan`,
        detail: since ? `Waiting for the QR code to be scanned since ${since}.` : 'Waiting for the QR code to be scanned.',
        action: 'qr',
      });
    } else if (session.status === 'FAILED') {
      items.push({
        id: `failed:${session.name}`,
        severity: 'error',
        kind: 'session',
        session: session.name,
        title: `${session.name} failed`,
        detail: since ? `The session stopped working ${since}.` : 'The session stopped working.',
        action: 'restart',
      });
    } else if (
      session.status === 'STARTING' &&
      session.statusSince !== null &&
      now - session.statusSince > ATTENTION.startingStuckMs
    ) {
      items.push({
        id: `starting:${session.name}`,
        severity: 'warning',
        kind: 'session',
        session: session.name,
        title: `${session.name} is stuck starting`,
        detail: `It has been starting since ${since}.`,
        action: 'restart',
      });
    }
  }

  for (const session of sessions) {
    const nearest = session.limits?.nearest;
    if (!nearest || nearest.ratio < ATTENTION.limitWarnRatio) continue;
    const reached = nearest.ratio >= 1;
    items.push({
      id: `limit:${session.name}`,
      severity: reached ? 'error' : 'warning',
      kind: 'limit',
      session: session.name,
      title: reached
        ? `${session.name} reached its ${nearest.label}`
        : `${session.name} is at ${Math.round(nearest.ratio * 100)}% of its ${nearest.label}`,
      detail: `${nearest.used} of ${nearest.cap} used.${reached ? ' Sends are refused until the window moves on.' : ''}`,
      action: 'limits',
    });
  }

  for (const hook of input.recent.webhookFailures) {
    const severe = hook.count >= ATTENTION.webhookErrorCount;
    items.push({
      id: `webhook:${hook.session ?? ''}:${hook.url ?? ''}`,
      severity: severe ? 'error' : 'warning',
      kind: 'webhook',
      session: hook.session,
      title: `Webhook failing: ${hook.url ?? 'unknown URL'}`,
      detail: `${hook.count} failed ${hook.count === 1 ? 'delivery' : 'deliveries'} in the last hour${hook.lastError ? ` (last: ${hook.lastError})` : ''}.`,
      action: 'webhooks',
    });
  }

  for (const [name, counts] of Object.entries(input.recent.perSession)) {
    if (!name) continue;
    if (counts.refused > 0) {
      items.push({
        id: `refused:${name}`,
        severity: 'warning',
        kind: 'sends',
        session: name,
        title: `${counts.refused} ${counts.refused === 1 ? 'send' : 'sends'} from ${name} refused by the sending policy`,
        detail: 'In the last hour. See the failure reasons below for which limit applied.',
        action: 'logs',
      });
    }
    const failedOnly = counts.failed - counts.refused;
    if (failedOnly >= ATTENTION.failedWarnCount) {
      items.push({
        id: `failed-sends:${name}`,
        severity: 'warning',
        kind: 'sends',
        session: name,
        title: `${failedOnly} sends from ${name} failed`,
        detail: 'In the last hour, not counting policy refusals.',
        action: 'logs',
      });
    }
  }

  const rank = { error: 0, warning: 1 } as const;
  return items.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

function failureReasons(audit: AuditSummary): DashboardSummary['failureReasons'] {
  const byReason = new Map<string, DashboardSummary['failureReasons'][number]>();
  for (const row of audit.failures) {
    const reason = failureReasonLabel(row.errorMessage, row.metadata);
    const existing = byReason.get(reason);
    if (!existing) {
      byReason.set(reason, {
        reason,
        count: row.count,
        lastAt: row.lastAt,
        session: row.session,
        example: row.errorMessage,
      });
      continue;
    }
    existing.count += row.count;
    if (row.lastAt > existing.lastAt) {
      existing.lastAt = row.lastAt;
      existing.session = row.session;
      existing.example = row.errorMessage;
    }
  }
  return [...byReason.values()].sort((a, b) => b.count - a.count).slice(0, 10);
}

export function buildDashboardSummary(input: DashboardSummaryInput): DashboardSummary {
  const spec = DASHBOARD_RANGES[input.range];
  const sessions: DashboardSession[] = input.sessions.map((session) => ({
    name: session.name,
    engine: session.engine,
    status: session.status,
    statusSince: iso(session.statusSince),
    lastActivityAt: iso(session.lastActivityAt),
    account: session.account,
    autoStart: session.autoStart,
    counts: input.audit.perSession[session.name] ?? emptyCounts(),
    limits: limitsFor(session),
  }));

  return {
    generatedAt: new Date(input.now).toISOString(),
    range: {
      key: input.range,
      from: new Date(input.now - spec.ms).toISOString(),
      to: new Date(input.now).toISOString(),
      bucketMs: spec.bucketMs,
    },
    server: { ...input.server, workers: 1 },
    sessions,
    attention: attentionFor(input, sessions),
    totals: input.audit.totals,
    series: input.audit.series,
    failureReasons: failureReasons(input.audit),
    webhooks: {
      delivered: input.audit.totals.webhookDelivered,
      failed: input.audit.totals.webhookFailed,
      failing: input.audit.webhookFailures,
    },
  };
}
