import { Database } from 'bun:sqlite';
import pino from 'pino';

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
  return crypto.randomUUID();
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
