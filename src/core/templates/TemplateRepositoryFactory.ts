import { Database } from 'bun:sqlite';
import { container } from 'tsyringe';
import { WhatsappConfigService } from '../../config.service';
import { ITemplateRepository } from './ITemplateRepository';
import { PostgresTemplateRepository } from './postgres/PostgresTemplateRepository';
import { Sqlite3TemplateRepository } from './sqlite3/Sqlite3TemplateRepository';

/**
 * Selects the template persistence driver the same way NowebStorageFactoryCore
 * selects the session store driver:
 *
 *   WAHA_DATABASE_DRIVER=postgres|postgresql → PostgreSQL
 *   WAHA_DATABASE_DRIVER=sqlite (or unset)   → SQLite
 *   anything else                            → startup error (no silent fallback)
 *
 * An explicitly injected Database handle or directory path always means SQLite:
 * callers that pass one (tests, embedded use) keep the old local-file
 * behaviour. The Postgres path is only taken when no handle was injected.
 */
export class TemplateRepositoryFactory {
  create(dbOrPath?: Database | string): ITemplateRepository {
    if (dbOrPath instanceof Database || typeof dbOrPath === 'string') {
      return new Sqlite3TemplateRepository(dbOrPath);
    }

    const config = container.resolve(WhatsappConfigService);
    const driver = config.getDatabaseDriver();

    if (driver === 'postgres') {
      return this.buildPostgres();
    }

    if (driver === 'sqlite') {
      return new Sqlite3TemplateRepository();
    }

    // getDatabaseDriver() rejects unknown values, so this is unreachable; it
    // exists only so a future driver cannot silently degrade to SQLite.
    throw new Error(`Unsupported database driver '${driver}'`);
  }

  private buildPostgres(): ITemplateRepository {
    const config = container.resolve(WhatsappConfigService);
    const connectionString = config.getSessionPostgresUrl();

    if (!connectionString) {
      throw new Error('WAHA_DATABASE_URL is required for PostgreSQL driver');
    }

    return new PostgresTemplateRepository(connectionString);
  }
}
