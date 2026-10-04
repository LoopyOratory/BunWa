import { LocalStore } from '../../../storage/LocalStore';
import { DataStore } from '../../../storage/DataStore';
import { INowebStorage } from './INowebStorage';
import { Sqlite3Storage } from './sqlite3/Sqlite3Storage';
import { PostgresStorage } from './postgres/PostgresStorage';
import { container } from 'tsyringe';
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

    return new PostgresStorage(connectionString);
  }
}
