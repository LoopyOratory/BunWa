import { LocalStore } from '../../../storage/LocalStore';
import { DataStore } from '../../../storage/DataStore';
import { INowebStorage } from './INowebStorage';
import { Sqlite3Storage } from './sqlite3/Sqlite3Storage';
import { PostgresStorage } from './postgres/PostgresStorage';
import { sessionSchemaName } from './postgres/session-schema';
import { container } from 'tsyringe';
import { rm } from 'fs/promises';
import { WhatsappConfigService } from '../../../../config.service';

export class NowebStorageFactoryCore {
  createStorage(store: DataStore, name: string): INowebStorage {
    const config = container.resolve(WhatsappConfigService);
    const driver = config.getDatabaseDriver();

    if (driver === 'postgres') {
      return this.buildStoragePostgres(name);
    }

    if (driver === 'sqlite') {
      if (store instanceof LocalStore) {
        return this.buildStorageSqlite3(store, name);
      }
      throw new Error(`Unsupported store type '${store.constructor.name}' for the sqlite driver`);
    }

    // getDatabaseDriver() rejects unknown values, so this is unreachable; it
    // exists only so a future driver cannot silently degrade to SQLite.
    throw new Error(`Unsupported database driver '${driver}'`);
  }

  /**
   * Remove a session's NOWEB store so a later session with the same name
   * starts empty: its Postgres schema, or its SQLite store file. Credentials
   * and the rest of the session directory are not touched here. The session
   * must already be stopped (its store closed).
   */
  async deleteStorage(store: LocalStore, name: string): Promise<void> {
    const config = container.resolve(WhatsappConfigService);
    const driver = config.getDatabaseDriver();

    if (driver === 'postgres') {
      const connectionString = config.getSessionPostgresUrl();
      if (!connectionString) return;
      await PostgresStorage.dropSessionSchema(connectionString, sessionSchemaName(name));
      return;
    }

    const file = store.getFilePath(name, 'store.sqlite3');
    await Promise.all(
      [file, `${file}-wal`, `${file}-shm`].map((path) => rm(path, { force: true })),
    );
  }

  private buildStorageSqlite3(store: LocalStore, name: string) {
    const filePath = store.getFilePath(name, 'store.sqlite3');
    return new Sqlite3Storage(filePath);
  }

  private buildStoragePostgres(name: string) {
    const config = container.resolve(WhatsappConfigService);
    const connectionString = config.getSessionPostgresUrl();
    
    if (!connectionString) {
      throw new Error('WAHA_DATABASE_URL is required for PostgreSQL driver');
    }

    return new PostgresStorage(connectionString, sessionSchemaName(name));
  }
}
