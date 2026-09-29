/**
 * Build a Postgres connection URL from the dashboard's flat database fields
 * (`WAHA_DB_HOST` / `WAHA_DB_PORT` / `WAHA_DB_USERNAME` / `WAHA_DB_PASSWORD` /
 * `WAHA_DB_NAME` / `WAHA_DB_SSL`).
 *
 * Shared by:
 * - the infra config endpoint, which writes the canonical `WAHA_DATABASE_URL`
 *   when the dashboard selects PostgreSQL, and
 * - `WhatsappConfigService.getSessionPostgresUrl()`, which falls back to these
 *   fields when no explicit URL is configured.
 */
export interface PostgresUrlParts {
  host?: string;
  port?: string | number;
  username?: string;
  password?: string;
  name?: string;
  ssl?: boolean;
}

export function buildPostgresUrl(parts: PostgresUrlParts): string {
  const host = (parts.host || '').trim() || 'localhost';
  const port = String(parts.port ?? '').trim() || '5432';
  const database = (parts.name || '').trim() || 'postgres';
  const username = (parts.username || '').trim();
  const password = parts.password ?? '';

  const credentials = username
    ? `${encodeURIComponent(username)}${password ? `:${encodeURIComponent(password)}` : ''}@`
    : '';

  const query = parts.ssl ? '?sslmode=require' : '';
  return `postgres://${credentials}${host}:${port}/${encodeURIComponent(database)}${query}`;
}
