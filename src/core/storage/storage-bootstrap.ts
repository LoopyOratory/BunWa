/**
 * Boot-time storage verification.
 *
 * Creating the schema lazily means a bad URL, a missing database or a failed
 * driver load first appears on a session start or the first template read.
 * This module runs the schema creation for the configured driver during
 * startup so the real error stops the process instead.
 *
 * For Postgres it connects, creates the NOWEB store tables and the templates
 * table, then closes the pools (session starts later re-run the idempotent
 * CREATE IF NOT EXISTS statements). For SQLite it creates the templates table
 * eagerly; per-session store files are still created on session start.
 */
import type { WhatsappConfigService } from '../../config.service';
import { PostgresStorage } from '../engines/noweb/store/postgres/PostgresStorage';
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

    const sessions = new PostgresStorage(connectionString);
    try {
      await sessions.init();
    } finally {
      await sessions.close().catch(() => {});
    }

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
