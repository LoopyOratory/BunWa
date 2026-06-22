import { ILabelAssociationRepository } from '../ILabelAssociationsRepository';
import { ILabelsRepository } from '../ILabelsRepository';
import { INowebLidPNRepository } from '../INowebLidPNRepository';
import { Sqlite3GroupRepository } from './Sqlite3GroupRepository';
import { Sqlite3LabelAssociationsRepository } from './Sqlite3LabelAssociationsRepository';
import { Sqlite3LabelsRepository } from './Sqlite3LabelsRepository';
import { Sqlite3LidPNRepository } from './Sqlite3LidPNRepository';
import { Database } from 'bun:sqlite';

import { INowebStorage } from '../INowebStorage';
import { Migrations, NOWEB_STORE_SCHEMA } from '../schemas';
import { Sqlite3ChatRepository } from './Sqlite3ChatRepository';
import { Sqlite3ContactRepository } from './Sqlite3ContactRepository';
import { Sqlite3MessagesRepository } from './Sqlite3MessagesRepository';
import pino from 'pino';

const log = pino({ name: 'Sqlite3Storage' });

export class Sqlite3Storage extends INowebStorage {
  private readonly db: Database;
  private lidRepository: INowebLidPNRepository | null = null;

  constructor(filePath: string) {
    super();
    this.db = new Database(filePath, {
      create: true,
      readwrite: true,
    });
    // Enable WAL mode for better concurrency
    this.db.run('PRAGMA journal_mode = WAL');
    this.db.run('PRAGMA synchronous = NORMAL');
  }

  async init() {
    // Check if tables already exist to skip expensive migrations
    const firstTable = NOWEB_STORE_SCHEMA[0];
    const exists = this.db.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
    ).get(firstTable.name);

    if (!exists) {
      this.migrate();
    }

    // Run validation in background — don't block startup
    this.validateSchema();
  }

  private migrate() {
    for (const migration of Migrations) {
      this.db.run(migration);
    }
  }

  private validateSchema() {
    for (const table of NOWEB_STORE_SCHEMA) {
      // Validate columns
      const columns = this.db.query(`PRAGMA table_info(${table.name})`).all() as any[];
      if (columns.length !== table.columns.length) {
        log.warn(
          { table: table.name, expected: table.columns.length, got: columns.length },
          'Table column count mismatch'
        );
      }
    }
  }

  async close() {
    this.db.close();
  }

  getDb(): Database {
    return this.db;
  }

  getContactsRepository() {
    return new Sqlite3ContactRepository(this.db);
  }

  getChatRepository() {
    return new Sqlite3ChatRepository(this.db);
  }

  getGroupRepository() {
    return new Sqlite3GroupRepository(this.db);
  }

  getLabelsRepository(): ILabelsRepository {
    return new Sqlite3LabelsRepository(this.db);
  }

  getLabelAssociationRepository(): ILabelAssociationRepository {
    return new Sqlite3LabelAssociationsRepository(this.db);
  }

  getMessagesRepository() {
    return new Sqlite3MessagesRepository(this.db, this.getLidRepository());
  }

  getLidPNRepository(): INowebLidPNRepository {
    return this.getLidRepository();
  }

  private getLidRepository(): INowebLidPNRepository {
    if (!this.lidRepository) {
      this.lidRepository = new Sqlite3LidPNRepository(this.db);
    }
    return this.lidRepository;
  }
}
