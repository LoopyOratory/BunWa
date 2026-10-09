/**
 * Boot-time storage verification.
 *
 * Creating the schema lazily means a bad URL, a missing database or a failed
 * driver load first appears on a session start or the first template read.
 * This module runs the schema creation for the configured driver during
 * startup so the real error stops the process instead.
 *
 * For Postgres it connects, checks the user may create schemas (each NOWEB
 * session's store lives in its own schema, created on session start), and
 * creates the templates table, then closes the pools. For SQLite it creates
 * the templates table eagerly; per-session store files are still created on
 * session start.
 */
import type { WhatsappConfigService } from '../../config.service';
import pino from 'pino';
import { makePostgresKnex } from '../db/knex-postgres';
import { PostgresTemplateRepository } from '../templates/postgres/PostgresTemplateRepository';
import { Sqlite3TemplateRepository } from '../templates/sqlite3/Sqlite3TemplateRepository';

export async function verifyStorageAtBoot(config: WhatsappConfigService): Promise<void> {
  const driver = config.getDatabaseDriver();

  if (driver === 'postgres') {
    const connectionString = config.getSessionPostgresUrl();
    if (!connectionString) {
      throw new Error(
        'WAHA_DATABASE_DRIVER=postgres requires a connection URL. Set WAHA_DATABASE_URL ' +
          '(or WHATSAPP_SESSIONS_POSTGRESQL_URL), or set WAHA_DB_TYPE=postgres with the ' +
          'WAHA_DB_HOST / WAHA_DB_PORT / WAHA_DB_USERNAME / WAHA_DB_PASSWORD / WAHA_DB_NAME fields.',
      );
    }

    await verifyPostgresSessionStore(connectionString);

    const templates = new PostgresTemplateRepository(connectionString);
    try {
      await templates.init();
    } finally {
      await templates.close().catch(() => {});
    }
    return;
  }

  // SQLite: create the templates table now. The file and table are local, so
  // this also verifies the storage directory is writable.
  const templates = new Sqlite3TemplateRepository();
  await templates.init();
}

const log = pino({ name: 'StorageBootstrap' });

/** Tables the NOWEB store used to share across every session in `public`. */
const LEGACY_SHARED_TABLES = ['chats', 'contacts', 'messages', 'groups', 'labels', 'labelAssociations', 'lid_map'];

/**
 * Per-session stores are created when a session starts, so at boot this only
 * proves the database is reachable and that the user may create schemas, and
 * reports the old shared tables, which are no longer read or written.
 */
async function verifyPostgresSessionStore(connectionString: string): Promise<void> {
  const knex = makePostgresKnex(connectionString);
  try {
    const privilege = await knex.raw(
      `SELECT has_database_privilege(current_user, current_database(), 'CREATE') AS can_create`,
    );
    if (!privilege.rows?.[0]?.can_create) {
      throw new Error(
        'The Postgres user cannot create schemas in this database. Each NOWEB session ' +
          'stores its chats in its own schema, so grant CREATE on the database ' +
          '(GRANT CREATE ON DATABASE <db> TO <user>).',
      );
    }

    const legacy = await knex.raw(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ANY(?)`,
      [LEGACY_SHARED_TABLES],
    );
    const found = (legacy.rows ?? []).map((row: { table_name: string }) => row.table_name);
    if (found.length > 0) {
      log.warn(
        `Postgres: the shared NOWEB store tables in the public schema (${found.join(', ')}) ` +
          'are no longer used; each session now keeps its chats in its own bunwa_<session> schema. ' +
          'They are kept as an archive. Drop them when you no longer need them.',
      );
    }
  } finally {
    await knex.destroy().catch(() => {});
  }
}
