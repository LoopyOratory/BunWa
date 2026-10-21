import { Database } from 'bun:sqlite';
import pino from 'pino';
import { injectable } from 'tsyringe';

const logger = pino({ name: 'AuditService' });

export enum AuditAction {
  API_KEY_CREATED = 'api_key_created',
  API_KEY_USED = 'api_key_used',
  API_KEY_REVOKED = 'api_key_revoked',
  API_KEY_DELETED = 'api_key_deleted',
  API_KEY_AUTH_FAILED = 'api_key_auth_failed',

  SESSION_CREATED = 'session_created',
  SESSION_STARTED = 'session_started',
  SESSION_STOPPED = 'session_stopped',
  SESSION_FORCE_KILLED = 'session_force_killed',
  SESSION_DELETED = 'session_deleted',
  SESSION_QR_GENERATED = 'session_qr_generated',
  SESSION_CONNECTED = 'session_connected',
  SESSION_DISCONNECTED = 'session_disconnected',

  MESSAGE_SENT = 'message_sent',
  MESSAGE_FAILED = 'message_failed',

  MCP_TOOL_CALLED = 'mcp_tool_called',
  MCP_TOOL_FAILED = 'mcp_tool_failed',

  WEBHOOK_CREATED = 'webhook_created',
  WEBHOOK_DELETED = 'webhook_deleted',
  WEBHOOK_TRIGGERED = 'webhook_triggered',
  WEBHOOK_FAILED = 'webhook_failed',
}

export enum AuditSeverity {
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export interface AuditLogEntry {
  id: string;
  action: AuditAction;
  severity: AuditSeverity;
  apiKeyId: string | null;
  apiKeyName: string | null;
  sessionId: string | null;
  sessionName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  method: string | null;
  path: string | null;
  statusCode: number | null;
  metadata: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface AuditContext {
  apiKeyId?: string;
  apiKeyName?: string;
  sessionId?: string;
  sessionName?: string;
  ipAddress?: string;
  userAgent?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  metadata?: Record<string, unknown>;
  errorMessage?: string;
}

export interface AuditQueryOptions {
  action?: AuditAction;
  apiKeyId?: string;
  sessionId?: string;
  severity?: AuditSeverity;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

function generateId(): string {
  // UUIDv7 (time-ordered): new rows append to the right edge of the primary-key
  // B-tree instead of scattering random keys through it, which keeps the audit
  // table's inserts cheap as it grows.
  return Bun.randomUUIDv7();
}

/**
 * Audit logging service ported from OpenWA's audit.service.ts.
 * Uses bun:sqlite for structured audit entries with severity levels,
 * action types, query/filter, and retention cleanup.
 *
 * Configurable via environment variables:
 *   AUDIT_RETENTION_DAYS — Days to keep audit logs (default: 90, <= 0 to disable)
 *   WAHA_STORAGE_DIR     — Directory for audit.db (default: './data')
 */
export interface AuditSummaryOptions {
  from: Date;
  to: Date;
  /** Width of one time-series bucket. */
  bucketMs: number;
  /** Only count rows for this session. */
  session?: string;
}

export interface AuditSessionCounts {
  sent: number;
  failed: number;
  /** Failed sends the sending policy refused (a subset of `failed`). */
  refused: number;
  webhookDelivered: number;
  webhookFailed: number;
}

export interface AuditSummary {
  perSession: Record<string, AuditSessionCounts>;
  totals: AuditSessionCounts;
  series: {
    bucketStart: number[];
    sent: number[];
    failed: number[];
    webhookDelivered: number[];
    webhookFailed: number[];
  };
  /** Raw failure groups; `failureReasonLabel` folds them into display reasons. */
  failures: Array<{
    errorMessage: string | null;
    metadata: Record<string, any> | null;
    count: number;
    lastAt: string;
    session: string | null;
  }>;
  webhookFailures: Array<{
    session: string | null;
    url: string | null;
    count: number;
    lastAt: string;
    lastError: string | null;
  }>;
}

/** One row of the "which features are used" breakdown. */
export interface AuditFeatureUsage {
  /** The REST action (sendText, sendImage, ...) or the MCP tool name. */
  feature: string;
  channel: 'api' | 'mcp';
  sent: number;
  failed: number;
  refused: number;
}

export interface AuditSessionStability {
  session: string;
  connected: number;
  disconnected: number;
  qr: number;
  stopped: number;
  /** Stops that carried an error (a failed start or a crash). */
  errors: number;
}

export interface AuditAnalytics {
  features: AuditFeatureUsage[];
  /** Sends (ok + failed) by hour of day, server local time, 24 entries. */
  byHour: { sent: number[]; failed: number[] };
  /** Refused sends per bucket, aligned with `summarize().series.bucketStart`. */
  refusedSeries: number[];
  stability: AuditSessionStability[];
  mcp: { calls: number; failed: number; tools: Array<{ tool: string; calls: number; failed: number }> };
  auth: { failed: number };
}

export type AuditErrorKind = 'send' | 'refused' | 'webhook' | 'mcp' | 'session' | 'auth';

export interface AuditErrorQuery {
  from: Date;
  to: Date;
  session?: string;
  kind?: AuditErrorKind;
  /** Case-insensitive text match on the error, path and metadata. */
  search?: string;
  limit?: number;
  offset?: number;
}

export interface AuditErrorRow {
  id: string;
  at: string;
  kind: AuditErrorKind;
  action: string;
  severity: string;
  session: string | null;
  errorMessage: string | null;
  statusCode: number | null;
  path: string | null;
  metadata: Record<string, any> | null;
}

/**
 * Outgoing message operations: REST sends (`message_*`) and MCP tools in the
 * message category (`mcp_tool_*`), which the MCP path audits instead.
 */
const SENT_SQL = `(action = 'message_sent' OR (action = 'mcp_tool_called' AND json_extract(metadata, '$.category') = 'message'))`;
const FAILED_SQL = `(action = 'message_failed' OR (action = 'mcp_tool_failed' AND json_extract(metadata, '$.category') = 'message'))`;

/** Which error-report kind a warn/error row is, in SQL (NULL = not an error). */
const ERROR_KIND_SQL = `CASE
    WHEN ${FAILED_SQL} AND json_extract(metadata, '$.reason') = 'policy' THEN 'refused'
    WHEN ${FAILED_SQL} THEN 'send'
    WHEN action = 'webhook_failed' THEN 'webhook'
    WHEN action = 'mcp_tool_failed' THEN 'mcp'
    WHEN action IN ('session_disconnected', 'session_force_killed')
      OR (action = 'session_stopped' AND errorMessage IS NOT NULL) THEN 'session'
    WHEN action = 'api_key_auth_failed' THEN 'auth'
  END`;

const emptyCounts = (): AuditSessionCounts => ({
  sent: 0,
  failed: 0,
  refused: 0,
  webhookDelivered: 0,
  webhookFailed: 0,
});

@injectable()
export class AuditService {
  private db: Database;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private shutdown = false;

  constructor(dbOrPath?: Database | string) {
    if (typeof dbOrPath === 'string') {
      this.db = new Database(`${dbOrPath}/audit.db`);
    } else if (dbOrPath instanceof Database) {
      this.db = dbOrPath;
    } else {
      const storageDir = process.env.WAHA_STORAGE_DIR ?? './data';
      // Auto-create the storage dir so fresh clones boot without a manual mkdir
      // (fixes SQLITE_CANTOPEN on first run when ./data does not exist yet).
      const { mkdirSync } = require('fs');
      mkdirSync(storageDir, { recursive: true });
      this.db = new Database(`${storageDir}/audit.db`);
    }

    this.db.run('PRAGMA journal_mode = WAL');
    this.initSchema();
    this.startCleanup();
  }

  private initSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'info',
        apiKeyId TEXT,
        apiKeyName TEXT,
        sessionId TEXT,
        sessionName TEXT,
        ipAddress TEXT,
        userAgent TEXT,
        method TEXT,
        path TEXT,
        statusCode INTEGER,
        metadata TEXT,
        errorMessage TEXT,
        createdAt TEXT NOT NULL
      )
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_logs(sessionId)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_audit_apikey ON audit_logs(apiKeyId)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(createdAt)`);
  }

  private startCleanup(): void {
    const parsed = Number.parseInt(process.env.AUDIT_RETENTION_DAYS ?? '', 10);
    const retentionDays = Number.isInteger(parsed) ? Math.max(0, parsed) : 90;

    if (retentionDays <= 0) {
      logger.info('Audit-log retention disabled (AUDIT_RETENTION_DAYS <= 0)');
      return;
    }

    const runCleanup = (): void => {
      this.cleanup(retentionDays)
        .then((n) => {
          if (n > 0) logger.info(`Pruned ${n} audit log(s) older than ${retentionDays} day(s)`);
        })
        .catch((err) => logger.error({ err: String(err) }, 'Audit-log cleanup failed'));
    };

    runCleanup();
    this.cleanupTimer = setInterval(runCleanup, 24 * 60 * 60 * 1000);
    this.cleanupTimer.unref?.();
  }

  async log(
    action: AuditAction,
    context: AuditContext = {},
    severity: AuditSeverity = AuditSeverity.INFO,
  ): Promise<AuditLogEntry | null> {
    const entry: AuditLogEntry = {
      id: generateId(),
      action,
      severity,
      apiKeyId: context.apiKeyId ?? null,
      apiKeyName: context.apiKeyName ?? null,
      sessionId: context.sessionId ?? null,
      sessionName: context.sessionName ?? null,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      method: context.method ?? null,
      path: context.path ?? null,
      statusCode: context.statusCode ?? null,
      metadata: context.metadata ? JSON.stringify(context.metadata) : null,
      errorMessage: context.errorMessage ?? null,
      createdAt: new Date().toISOString(),
    };

    try {
      this.db.run(
        `INSERT INTO audit_logs (id, action, severity, apiKeyId, apiKeyName, sessionId, sessionName,
          ipAddress, userAgent, method, path, statusCode, metadata, errorMessage, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.id, entry.action, entry.severity, entry.apiKeyId, entry.apiKeyName,
          entry.sessionId, entry.sessionName, entry.ipAddress, entry.userAgent,
          entry.method, entry.path, entry.statusCode, entry.metadata, entry.errorMessage,
          entry.createdAt,
        ],
      );
      return entry;
    } catch (error) {
      logger.error(
        { action: String(action), error: String(error) },
        `Failed to write audit log for ${String(action)}`,
      );
      return null;
    }
  }

  async logInfo(action: AuditAction, context: AuditContext = {}): Promise<AuditLogEntry | null> {
    return this.log(action, context, AuditSeverity.INFO);
  }

  async logWarn(action: AuditAction, context: AuditContext = {}): Promise<AuditLogEntry | null> {
    return this.log(action, context, AuditSeverity.WARN);
  }

  async logError(action: AuditAction, context: AuditContext = {}): Promise<AuditLogEntry | null> {
    return this.log(action, context, AuditSeverity.ERROR);
  }

  async findAll(options: AuditQueryOptions = {}): Promise<{ data: AuditLogEntry[]; total: number }> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (options.action) {
      conditions.push('action = ?');
      params.push(options.action);
    }
    if (options.apiKeyId) {
      conditions.push('apiKeyId = ?');
      params.push(options.apiKeyId);
    }
    if (options.sessionId) {
      conditions.push('sessionId = ?');
      params.push(options.sessionId);
    }
    if (options.severity) {
      conditions.push('severity = ?');
      params.push(options.severity);
    }
    if (options.startDate) {
      conditions.push('createdAt >= ?');
      params.push(options.startDate.toISOString());
    }
    if (options.endDate) {
      conditions.push('createdAt <= ?');
      params.push(options.endDate.toISOString());
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const totalRow = this.db.query(`SELECT COUNT(*) as count FROM audit_logs ${where}`).get(...params) as { count: number };
    const total = totalRow?.count ?? 0;

    const rows = this.db
      .query(`SELECT * FROM audit_logs ${where} ORDER BY createdAt DESC LIMIT ${limit} OFFSET ${offset}`)
      .all(...params) as AuditLogEntry[];

    return { data: rows, total };
  }

  /**
   * Counts for the ops dashboard over a time range, aggregated in SQL so the
   * numbers stay right however many rows the range holds.
   */
  summarize(options: AuditSummaryOptions): AuditSummary {
    const fromIso = options.from.toISOString();
    const toIso = options.to.toISOString();
    const fromMs = options.from.getTime();
    const bucketMs = Math.max(1, Math.floor(options.bucketMs));
    const sessionSql = options.session ? ' AND sessionName = ?' : '';
    const base = (extra: string) =>
      `FROM audit_logs WHERE createdAt >= ? AND createdAt < ?${sessionSql} AND ${extra}`;
    const params = options.session ? [fromIso, toIso, options.session] : [fromIso, toIso];

    const kindSql = `CASE
        WHEN ${SENT_SQL} THEN 'sent'
        WHEN ${FAILED_SQL} AND json_extract(metadata, '$.reason') = 'policy' THEN 'refused'
        WHEN ${FAILED_SQL} THEN 'failed'
        WHEN action = 'webhook_triggered' THEN 'webhookDelivered'
        WHEN action = 'webhook_failed' THEN 'webhookFailed'
      END`;
    const relevant = `action IN ('message_sent', 'message_failed', 'mcp_tool_called', 'mcp_tool_failed', 'webhook_triggered', 'webhook_failed')`;

    const perSession: Record<string, AuditSessionCounts> = {};
    const totals = emptyCounts();
    const add = (counts: AuditSessionCounts, kind: string, n: number) => {
      if (kind === 'refused') {
        counts.refused += n;
        counts.failed += n;
      } else if (kind in counts) {
        (counts as any)[kind] += n;
      }
    };

    const grouped = this.db
      .query(`SELECT sessionName AS session, ${kindSql} AS kind, COUNT(*) AS n ${base(relevant)} GROUP BY session, kind`)
      .all(...params) as Array<{ session: string | null; kind: string | null; n: number }>;
    for (const row of grouped) {
      if (!row.kind) continue;
      const key = row.session ?? '';
      perSession[key] ??= emptyCounts();
      add(perSession[key], row.kind, row.n);
      add(totals, row.kind, row.n);
    }

    const bucketCount = Math.max(1, Math.ceil((options.to.getTime() - fromMs) / bucketMs));
    const series = {
      bucketStart: Array.from({ length: bucketCount }, (_, i) => fromMs + i * bucketMs),
      sent: new Array(bucketCount).fill(0),
      failed: new Array(bucketCount).fill(0),
      webhookDelivered: new Array(bucketCount).fill(0),
      webhookFailed: new Array(bucketCount).fill(0),
    };
    const bucketed = this.db
      .query(
        `SELECT (CAST(strftime('%s', createdAt) AS INTEGER) * 1000 - ?) / ? AS bucket, ${kindSql} AS kind, COUNT(*) AS n
         ${base(relevant)} GROUP BY bucket, kind`,
      )
      .all(fromMs, bucketMs, ...params) as Array<{ bucket: number; kind: string | null; n: number }>;
    for (const row of bucketed) {
      if (!row.kind || row.bucket < 0 || row.bucket >= bucketCount) continue;
      const kind = row.kind === 'refused' ? 'failed' : row.kind;
      (series as any)[kind][row.bucket] += row.n;
    }

    // SQLite returns the other columns from the row that holds MAX(createdAt),
    // so `session` and `lastError` describe the most recent occurrence.
    const failures = (this.db
      .query(
        `SELECT errorMessage, metadata, COUNT(*) AS count, MAX(createdAt) AS lastAt, sessionName AS session
         ${base(FAILED_SQL)} GROUP BY errorMessage ORDER BY count DESC LIMIT 50`,
      )
      .all(...params) as Array<{ errorMessage: string | null; metadata: string | null; count: number; lastAt: string; session: string | null }>)
      .map((row) => ({ ...row, metadata: parseMetadata(row.metadata) }));

    const webhookFailures = this.db
      .query(
        `SELECT sessionName AS session, json_extract(metadata, '$.url') AS url, COUNT(*) AS count,
                MAX(createdAt) AS lastAt, errorMessage AS lastError
         ${base(`action = 'webhook_failed'`)} GROUP BY session, url ORDER BY count DESC LIMIT 50`,
      )
      .all(...params) as AuditSummary['webhookFailures'];

    return { perSession, totals, series, failures, webhookFailures };
  }

  /**
   * The analytics view on top of summarize(): what is used (per feature and
   * channel), when (hour of day), refused sends over time, how stable each
   * session is, and MCP / auth activity. Aggregated in SQL.
   */
  analytics(options: AuditSummaryOptions): AuditAnalytics {
    const fromIso = options.from.toISOString();
    const toIso = options.to.toISOString();
    const fromMs = options.from.getTime();
    const bucketMs = Math.max(1, Math.floor(options.bucketMs));
    const sessionSql = options.session ? ' AND sessionName = ?' : '';
    const base = (extra: string) =>
      `FROM audit_logs WHERE createdAt >= ? AND createdAt < ?${sessionSql} AND ${extra}`;
    const params = options.session ? [fromIso, toIso, options.session] : [fromIso, toIso];
    const sendKind = `CASE WHEN ${SENT_SQL} THEN 'sent'
        WHEN ${FAILED_SQL} AND json_extract(metadata, '$.reason') = 'policy' THEN 'refused'
        ELSE 'failed' END`;
    const sends = `(${SENT_SQL} OR ${FAILED_SQL})`;

    const features = new Map<string, AuditFeatureUsage>();
    const featureRows = this.db
      .query(
        `SELECT COALESCE(json_extract(metadata, '$.tool'), json_extract(metadata, '$.action'), 'unknown') AS feature,
                CASE WHEN action LIKE 'mcp_%' THEN 'mcp' ELSE 'api' END AS channel,
                ${sendKind} AS kind, COUNT(*) AS n
         ${base(sends)} GROUP BY feature, channel, kind`,
      )
      .all(...params) as Array<{ feature: string; channel: 'api' | 'mcp'; kind: string; n: number }>;
    for (const row of featureRows) {
      const key = `${row.channel}:${row.feature}`;
      const entry = features.get(key) ?? { feature: row.feature, channel: row.channel, sent: 0, failed: 0, refused: 0 };
      if (row.kind === 'sent') entry.sent += row.n;
      else {
        entry.failed += row.n;
        if (row.kind === 'refused') entry.refused += row.n;
      }
      features.set(key, entry);
    }

    const byHour = { sent: Array.from({ length: 24 }, () => 0), failed: Array.from({ length: 24 }, () => 0) };
    const hourRows = this.db
      .query(
        `SELECT CAST(strftime('%H', createdAt, 'localtime') AS INTEGER) AS hour,
                CASE WHEN ${SENT_SQL} THEN 'sent' ELSE 'failed' END AS kind, COUNT(*) AS n
         ${base(sends)} GROUP BY hour, kind`,
      )
      .all(...params) as Array<{ hour: number; kind: 'sent' | 'failed'; n: number }>;
    for (const row of hourRows) {
      if (row.hour >= 0 && row.hour < 24) byHour[row.kind][row.hour] += row.n;
    }

    const bucketCount = Math.max(1, Math.ceil((options.to.getTime() - fromMs) / bucketMs));
    const refusedSeries = Array.from({ length: bucketCount }, () => 0);
    const refusedRows = this.db
      .query(
        `SELECT (CAST(strftime('%s', createdAt) AS INTEGER) * 1000 - ?) / ? AS bucket, COUNT(*) AS n
         ${base(`${FAILED_SQL} AND json_extract(metadata, '$.reason') = 'policy'`)} GROUP BY bucket`,
      )
      .all(fromMs, bucketMs, ...params) as Array<{ bucket: number; n: number }>;
    for (const row of refusedRows) {
      if (row.bucket >= 0 && row.bucket < bucketCount) refusedSeries[row.bucket] += row.n;
    }

    const stability = this.db
      .query(
        `SELECT sessionName AS session,
                SUM(action = 'session_connected') AS connected,
                SUM(action = 'session_disconnected') AS disconnected,
                SUM(action = 'session_qr_generated') AS qr,
                SUM(action = 'session_stopped') AS stopped,
                SUM((action = 'session_stopped' AND errorMessage IS NOT NULL) OR action = 'session_force_killed') AS errors
         ${base(`sessionName IS NOT NULL AND action IN ('session_connected', 'session_disconnected', 'session_qr_generated', 'session_stopped', 'session_force_killed')`)}
         GROUP BY sessionName ORDER BY sessionName`,
      )
      .all(...params) as AuditSessionStability[];

    const tools = this.db
      .query(
        `SELECT json_extract(metadata, '$.tool') AS tool, COUNT(*) AS calls, SUM(action = 'mcp_tool_failed') AS failed
         ${base(`action IN ('mcp_tool_called', 'mcp_tool_failed')`)} GROUP BY tool ORDER BY calls DESC LIMIT 15`,
      )
      .all(...params) as Array<{ tool: string | null; calls: number; failed: number }>;
    const mcpTotals = this.db
      .query(
        `SELECT COUNT(*) AS calls, COALESCE(SUM(action = 'mcp_tool_failed'), 0) AS failed
         ${base(`action IN ('mcp_tool_called', 'mcp_tool_failed')`)}`,
      )
      .get(...params) as { calls: number; failed: number };
    const authFailed = this.db
      .query(`SELECT COUNT(*) AS n ${base(`action = 'api_key_auth_failed'`)}`)
      .get(...params) as { n: number };

    return {
      features: [...features.values()].sort((a, b) => b.sent + b.failed - (a.sent + a.failed)),
      byHour,
      refusedSeries,
      stability,
      mcp: {
        calls: mcpTotals?.calls ?? 0,
        failed: mcpTotals?.failed ?? 0,
        tools: tools.map((t) => ({ tool: t.tool ?? 'unknown', calls: t.calls, failed: t.failed })),
      },
      auth: { failed: authFailed?.n ?? 0 },
    };
  }

  /** Error report: every failure-like row in a range, newest first, filterable. */
  errors(query: AuditErrorQuery): { total: number; byKind: Record<AuditErrorKind, number>; rows: AuditErrorRow[] } {
    const conditions = ['createdAt >= ?', 'createdAt < ?', `(${ERROR_KIND_SQL}) IS NOT NULL`];
    const params: (string | number)[] = [query.from.toISOString(), query.to.toISOString()];
    if (query.session) {
      conditions.push('sessionName = ?');
      params.push(query.session);
    }
    const scoped = [...conditions];
    const scopedParams = [...params];
    if (query.kind) {
      conditions.push(`(${ERROR_KIND_SQL}) = ?`);
      params.push(query.kind);
    }
    if (query.search?.trim()) {
      conditions.push(`(LOWER(COALESCE(errorMessage, '') || ' ' || COALESCE(path, '') || ' ' || COALESCE(metadata, '') || ' ' || COALESCE(sessionName, '')) LIKE ?)`);
      params.push(`%${query.search.trim().toLowerCase()}%`);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const limit = Math.min(500, Math.max(1, Math.floor(query.limit ?? 50)));
    const offset = Math.max(0, Math.floor(query.offset ?? 0));

    const total = (this.db.query(`SELECT COUNT(*) AS n FROM audit_logs ${where}`).get(...params) as { n: number })?.n ?? 0;
    const byKind: Record<AuditErrorKind, number> = { send: 0, refused: 0, webhook: 0, mcp: 0, session: 0, auth: 0 };
    const kindRows = this.db
      .query(`SELECT ${ERROR_KIND_SQL} AS kind, COUNT(*) AS n FROM audit_logs WHERE ${scoped.join(' AND ')} GROUP BY kind`)
      .all(...scopedParams) as Array<{ kind: AuditErrorKind; n: number }>;
    for (const row of kindRows) {
      if (row.kind in byKind) byKind[row.kind] = row.n;
    }
    const rows = (this.db
      .query(
        `SELECT id, createdAt AS at, ${ERROR_KIND_SQL} AS kind, action, severity, sessionName AS session,
                errorMessage, statusCode, path, metadata
         FROM audit_logs ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as Array<Omit<AuditErrorRow, 'metadata'> & { metadata: string | null }>)
      .map((row) => ({ ...row, metadata: parseMetadata(row.metadata) }));
    return { total, byKind, rows };
  }

  async getRecentByApiKey(apiKeyId: string, limit = 10): Promise<AuditLogEntry[]> {
    return this.db
      .query(`SELECT * FROM audit_logs WHERE apiKeyId = ? ORDER BY createdAt DESC LIMIT ${limit}`)
      .all(apiKeyId) as AuditLogEntry[];
  }

  async getRecentBySession(sessionId: string, limit = 10): Promise<AuditLogEntry[]> {
    return this.db
      .query(`SELECT * FROM audit_logs WHERE sessionId = ? ORDER BY createdAt DESC LIMIT ${limit}`)
      .all(sessionId) as AuditLogEntry[];
  }

  async cleanup(olderThanDays = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    const cutoff = cutoffDate.toISOString();

    const result = this.db.run(`DELETE FROM audit_logs WHERE createdAt < ?`, [cutoff]);
    return result.changes;
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

function parseMetadata(raw: string | null): Record<string, any> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
