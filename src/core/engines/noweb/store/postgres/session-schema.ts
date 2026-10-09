import { CryptoHasher } from 'bun';

/** Prefix for every per-session NOWEB store schema. */
export const SESSION_SCHEMA_PREFIX = 'bunwa_';

/** PostgreSQL truncates identifiers past 63 bytes (NAMEDATALEN - 1). */
const MAX_IDENTIFIER_BYTES = 63;
const HASH_CHARS = 12;
const HEAD_CHARS = 40;

/**
 * The Postgres schema that holds one session's NOWEB store.
 *
 * Every session used to share the same `chats`, `contacts` and `messages`
 * tables, with no column saying which session a row belonged to, so one
 * session's chat list showed every session's chats and deleted sessions' rows
 * never went away. Each session now gets its own schema, and every query
 * names it explicitly (see `schemaScopedKnex` in PostgresStorage).
 *
 * The name keeps the session name's case (schemas are always quoted, so
 * `Vivita` and `vivita` stay distinct). A name that would pass the 63-byte
 * identifier limit is shortened to its first characters plus a hash of the
 * full name, which keeps it unique and stable.
 */
export function sessionSchemaName(session: string): string {
  const full = `${SESSION_SCHEMA_PREFIX}${session}`;
  if (Buffer.byteLength(full, 'utf8') <= MAX_IDENTIFIER_BYTES) {
    return full;
  }
  const hash = new CryptoHasher('sha256').update(session).digest('hex').slice(0, HASH_CHARS);
  // Trim by code point, then by bytes, so a multi-byte character is never cut
  // in half and the result always fits.
  let head = Array.from(session).slice(0, HEAD_CHARS).join('');
  const budget = MAX_IDENTIFIER_BYTES - SESSION_SCHEMA_PREFIX.length - 1 - HASH_CHARS;
  while (Buffer.byteLength(head, 'utf8') > budget) {
    head = Array.from(head).slice(0, -1).join('');
  }
  return `${SESSION_SCHEMA_PREFIX}${head}_${hash}`;
}

/** Quote a Postgres identifier for use in raw SQL. */
export function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}
