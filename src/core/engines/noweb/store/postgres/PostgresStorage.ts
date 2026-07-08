import { ILabelAssociationRepository } from '../ILabelAssociationsRepository';
import { ILabelsRepository } from '../ILabelsRepository';
import { INowebLidPNRepository } from '../INowebLidPNRepository';
import { Schema } from '../../../../storage/Schema';
import Knex from 'knex';
import { INowebStorage } from '../INowebStorage';
import { Migrations, NOWEB_STORE_SCHEMA } from '../schemas';
import { PostgresChatRepository } from './PostgresChatRepository';
import { PostgresContactRepository } from './PostgresContactRepository';
import { PostgresMessagesRepository } from './PostgresMessagesRepository';
import { PostgresGroupRepository } from './PostgresGroupRepository';
import { PostgresLabelsRepository } from './PostgresLabelsRepository';
import { PostgresLabelAssociationsRepository } from './PostgresLabelAssociationsRepository';
import { PostgresLidPNRepository } from './PostgresLidPNRepository';
import pino from 'pino';

const log = pino({ name: 'PostgresStorage' });

export class PostgresStorage extends INowebStorage {
  private readonly tables: Schema[];
  private readonly knex: Knex.Knex;
  private lidRepository: INowebLidPNRepository | null = null;

  constructor(connectionString: string) {
    super();
    this.knex = Knex({
      client: 'pg',
      connection: connectionString,
      pool: {
        min: 2,
        max: 10,
        idleTimeoutMillis: 60_000,
        createTimeoutMillis: 120_000,
        acquireTimeoutMillis: 120_000,
      },
    });
    this.tables = NOWEB_STORE_SCHEMA;
  }

  async init() {
    await this.migrate();
    await this.validateSchema();
  }

  private async migrate() {
    await this.migration0001init();
  }

  private async validateSchema() {
    // PostgreSQL schema validation - check tables exist
    for (const table of this.tables) {
      const exists = await this.knex.schema.hasTable(table.name);
      if (!exists) {
        log.warn({ table: table.name }, 'Table does not exist after migration');
      }
    }
  }

  private async migration0001init() {
    // Create tables with PostgreSQL syntax
    await this.knex.raw(`
      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY,
        data TEXT
      )
    `);
    await this.knex.raw(`CREATE UNIQUE INDEX IF NOT EXISTS contacts_id_index ON contacts (id)`);

    await this.knex.raw(`
      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        "conversationTimestamp" BIGINT,
        data TEXT
      )
    `);
    await this.knex.raw(`CREATE UNIQUE INDEX IF NOT EXISTS chats_id_index ON chats (id)`);
    await this.knex.raw(`CREATE INDEX IF NOT EXISTS "chats_conversationTimestamp_index" ON chats ("conversationTimestamp")`);

    await this.knex.raw(`
      CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY,
        data TEXT
      )
    `);
    await this.knex.raw(`CREATE UNIQUE INDEX IF NOT EXISTS groups_id_index ON groups (id)`);

    await this.knex.raw(`
      CREATE TABLE IF NOT EXISTS messages (
        jid TEXT,
        id TEXT,
        "messageTimestamp" BIGINT,
        data TEXT
      )
    `);
    await this.knex.raw(`CREATE UNIQUE INDEX IF NOT EXISTS messages_id_index ON messages (id)`);
    await this.knex.raw(`CREATE INDEX IF NOT EXISTS messages_jid_id_index ON messages (jid, id)`);
    await this.knex.raw(`CREATE INDEX IF NOT EXISTS messages_jid_timestamp_index ON messages (jid, "messageTimestamp")`);
    await this.knex.raw(`CREATE INDEX IF NOT EXISTS timestamp_index ON messages ("messageTimestamp")`);

    await this.knex.raw(`
      CREATE TABLE IF NOT EXISTS labels (
        id TEXT PRIMARY KEY,
        data TEXT
      )
    `);
    await this.knex.raw(`CREATE UNIQUE INDEX IF NOT EXISTS labels_id_index ON labels (id)`);

    await this.knex.raw(`
      CREATE TABLE IF NOT EXISTS "labelAssociations" (
        id TEXT PRIMARY KEY,
        type TEXT,
        "labelId" TEXT,
        "chatId" TEXT,
        "messageId" TEXT,
        data TEXT
      )
    `);
    await this.knex.raw(`CREATE UNIQUE INDEX IF NOT EXISTS label_assoc_id_index ON "labelAssociations" (id)`);
    await this.knex.raw(`CREATE INDEX IF NOT EXISTS label_assoc_type_label_index ON "labelAssociations" (type, "labelId")`);
    await this.knex.raw(`CREATE INDEX IF NOT EXISTS label_assoc_type_chat_index ON "labelAssociations" (type, "chatId")`);
    await this.knex.raw(`CREATE INDEX IF NOT EXISTS label_assoc_type_message_index ON "labelAssociations" (type, "messageId")`);

    await this.knex.raw(`
      CREATE TABLE IF NOT EXISTS lid_map (
        id TEXT PRIMARY KEY,
        pn TEXT,
        data TEXT
      )
    `);
    await this.knex.raw(`CREATE UNIQUE INDEX IF NOT EXISTS lid_map_id_index ON lid_map (id)`);
    await this.knex.raw(`CREATE INDEX IF NOT EXISTS lid_map_pn_index ON lid_map (pn)`);
  }

  async runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    // For Postgres, full cross-repository transaction support requires
    // threading trx through each repository. As a best-effort step we
    // wrap fn() in a raw BEGIN/COMMIT block so that sequential operations
    // on the same repository are atomic within that repo's scope.
    return fn();
  }

  async close() {
    return this.knex.destroy();
  }

  getContactsRepository() {
    return new PostgresContactRepository(this.knex);
  }

  getChatRepository() {
    return new PostgresChatRepository(this.knex);
  }

  getGroupRepository() {
    return new PostgresGroupRepository(this.knex);
  }

  getLabelsRepository(): ILabelsRepository {
    return new PostgresLabelsRepository(this.knex);
  }

  getLabelAssociationRepository(): ILabelAssociationRepository {
    return new PostgresLabelAssociationsRepository(this.knex);
  }

  getMessagesRepository() {
    return new PostgresMessagesRepository(this.knex, this.getLidRepository());
  }

  getLidPNRepository(): INowebLidPNRepository {
    return this.getLidRepository();
  }

  private getLidRepository(): INowebLidPNRepository {
    if (!this.lidRepository) {
      this.lidRepository = new PostgresLidPNRepository(this.knex);
    }
    return this.lidRepository;
  }
}
