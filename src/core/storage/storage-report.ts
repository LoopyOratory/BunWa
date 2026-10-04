/**
 * One-line storage report for boot logging.
 *
 * The driver switch has enough moving parts (canonical keys, dashboard
 * fallback, per-subsystem exceptions) that "which store is this process
 * actually using" must be answerable from the first log line. This module is
 * kept free of side effects so the formatting can be unit tested without a
 * server.
 */
import { resolve } from 'path';
import type { WhatsappConfigService } from '../../config.service';

/**
 * Replace the password in a Postgres URL with `***`.
 *
 * Keeps user, host, port, database and query string. Falls back to a regex
 * when the URL cannot be parsed (for example an unencoded `@` in the
 * password), so the secret never reaches the log either way.
 */
export function redactPostgresUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.password) {
      return url;
    }
    const user = parsed.username ? encodeURIComponent(parsed.username) : '';
    return `${parsed.protocol}//${user}:***@${parsed.host}${parsed.pathname}${parsed.search}`;
  } catch {
    return url.replace(/^([a-z][a-z0-9+.-]*:\/\/[^:@/]*):[^@]*@/i, '$1:***@');
  }
}

export interface StorageReportOptions {
  /** Session auth/index directory (always SQLite). Defaults to WAHA_LOCAL_STORE_BASE_DIR or .sessions. */
  sessionsBaseDir?: string;
  /** Internal database directory (audit, sending policy, SQLite templates). Defaults to WAHA_STORAGE_DIR or ./data. */
  storageDir?: string;
  /** Postgres connection string; when omitted the config service is consulted. */
  postgresUrl?: string;
}

/**
 * Render the resolved driver and the concrete target of every store:
 *
 *   Storage: driver=postgres sessions-auth=sqlite /app/.sessions
 *   sessions-chat=postgres app:***@db:5432/waha templates=postgres ...
 *   audit=sqlite /app/data/audit.db sending-policy=sqlite /app/data/sending-limits.db
 */
export function describeStorage(
  config: WhatsappConfigService,
  options: StorageReportOptions = {},
): string {
  const driver = config.getDatabaseDriver();
  const sessionsBaseDir = resolve(
    options.sessionsBaseDir ?? process.env.WAHA_LOCAL_STORE_BASE_DIR ?? '.sessions',
  );
  const storageDir = resolve(
    options.storageDir ?? process.env.WAHA_STORAGE_DIR ?? './data',
  );

  const postgresRaw = options.postgresUrl ?? config.getSessionPostgresUrl();
  const postgresTarget = postgresRaw
    ? `postgres ${redactPostgresUrl(postgresRaw)}`
    : 'postgres (connection URL not configured)';

  const sessionsChat =
    driver === 'postgres'
      ? postgresTarget
      : `sqlite ${sessionsBaseDir}/noweb/<session>/store.sqlite3`;
  const templates =
    driver === 'postgres' ? postgresTarget : `sqlite ${storageDir}/templates.db`;

  return [
    `Storage: driver=${driver}`,
    `sessions-auth=sqlite ${sessionsBaseDir}`,
    `sessions-chat=${sessionsChat}`,
    `templates=${templates}`,
    `audit=sqlite ${storageDir}/audit.db`,
    `sending-policy=sqlite ${storageDir}/sending-limits.db`,
  ].join(' ');
}
