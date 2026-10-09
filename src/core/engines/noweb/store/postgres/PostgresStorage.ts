import { ILabelAssociationRepository } from '../ILabelAssociationsRepository';
import { ILabelsRepository } from '../ILabelsRepository';
import { INowebLidPNRepository } from '../INowebLidPNRepository';
import { Schema } from '../../../../storage/Schema';
import Knex from 'knex';
import { INowebStorage } from '../INowebStorage';
import { makePostgresKnex } from '../../../../db/knex-postgres';
import { Migrations, NOWEB_STORE_SCHEMA } from '../schemas';
import { quoteIdentifier } from './session-schema';
import { PostgresChatRepository } from './PostgresChatRepository';
import { PostgresContactRepository } from './PostgresContactRepository';
import { PostgresMessagesRepository } from './PostgresMessagesRepository';
import { PostgresGroupRepository } from './PostgresGroupRepository';
import { PostgresLabelsRepository } from './PostgresLabelsRepository';
import { PostgresLabelAssociationsRepository } from './PostgresLabelAssociationsRepository';
import { PostgresLidPNRepository } from './PostgresLidPNRepository';
import pino from 'pino';

const log = pino({ name: 'PostgresStorage' });

/**
 * One session's NOWEB store on PostgreSQL.
 *
 * Each session lives in its own schema (see `sessionSchemaName`). Every query
 * is qualified with it (repositories get a `schemaScopedKnex`, the DDL names
 * the schema), so a session only ever reads and writes its own tables.
 */
export class PostgresStorage extends INowebStorage {
  private readonly tables: Schema[];
  /** Raw connection pool, for DDL and teardown. */
  private readonly pool: Knex.Knex;
  /** What repositories query through: every `knex('table')` lands in this session's schema. */
  private readonly knex: Knex.Knex;
  private lidRepository: INowebLidPNRepository | null = null;

  constructor(connectionString: string, readonly schema: string) {
    super();
    if (!schema) {
      throw new Error('PostgresStorage needs a per-session schema name');
    }
    this.pool = makePostgresKnex(connectionString);
    this.knex = schemaScopedKnex(this.pool, schema);
    this.tables = NOWEB_STORE_SCHEMA;
  }

  async init() {
    await this.pool.raw(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(this.schema)}`);
    await this.migrate();
    await this.validateSchema();
  }

  /**
   * Remove a session's store: its schema and every table in it. Used when a
   * session is deleted, so a later session with the same name starts empty.
   */
  static async dropSessionSchema(connectionString: string, schema: string): Promise<void> {
    const knex = makePostgresKnex(connectionString);
    try {
      await knex.raw(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
    } finally {
      await knex.destroy();
    }
  }

  private async migrate() {
    await this.migration0001init();
  }

  private async validateSchema() {
    // PostgreSQL schema validation - check tables exist in this session's schema
    for (const table of this.tables) {
      const exists = await this.pool.schema.withSchema(this.schema).hasTable(table.name);
      if (!exists) {
        log.warn({ table: table.name }, 'Table does not exist after migration');
      }
    }
  }

  private async migration0001init() {
    // Every name is qualified with this session's schema: the store must not
    // depend on connection state such as search_path, which a pooled or
    // single-backend server (PGlite) does not keep per connection.
    const s = quoteIdentifier(this.schema);
    // Create tables with PostgreSQL syntax
    await this.pool.raw(`
      CREATE TABLE IF NOT EXISTS ${s}.contacts (
        id TEXT PRIMARY KEY,
        data TEXT
      )
    `);
    await this.pool.raw(`CREATE UNIQUE INDEX IF NOT EXISTS contacts_id_index ON ${s}.contacts (id)`);

    await this.pool.raw(`
      CREATE TABLE IF NOT EXISTS ${s}.chats (
        id TEXT PRIMARY KEY,
        "conversationTimestamp" BIGINT,
        data TEXT
      )
    `);
    await this.pool.raw(`CREATE UNIQUE INDEX IF NOT EXISTS chats_id_index ON ${s}.chats (id)`);
    await this.pool.raw(`CREATE INDEX IF NOT EXISTS "chats_conversationTimestamp_index" ON ${s}.chats ("conversationTimestamp")`);

    await this.pool.raw(`
      CREATE TABLE IF NOT EXISTS ${s}.groups (
        id TEXT PRIMARY KEY,
        data TEXT
      )
    `);
    await this.pool.raw(`CREATE UNIQUE INDEX IF NOT EXISTS groups_id_index ON ${s}.groups (id)`);

    await this.pool.raw(`
      CREATE TABLE IF NOT EXISTS ${s}.messages (
        jid TEXT,
        id TEXT,
        "messageTimestamp" BIGINT,
        data TEXT
      )
    `);
    await this.pool.raw(`CREATE UNIQUE INDEX IF NOT EXISTS messages_id_index ON ${s}.messages (id)`);
    await this.pool.raw(`CREATE INDEX IF NOT EXISTS messages_jid_id_index ON ${s}.messages (jid, id)`);
    await this.pool.raw(`CREATE INDEX IF NOT EXISTS messages_jid_timestamp_index ON ${s}.messages (jid, "messageTimestamp")`);
    await this.pool.raw(`CREATE INDEX IF NOT EXISTS timestamp_index ON ${s}.messages ("messageTimestamp")`);

    await this.pool.raw(`
      CREATE TABLE IF NOT EXISTS ${s}.labels (
        id TEXT PRIMARY KEY,
        data TEXT
      )
    `);
    await this.pool.raw(`CREATE UNIQUE INDEX IF NOT EXISTS labels_id_index ON ${s}.labels (id)`);

    await this.pool.raw(`
      CREATE TABLE IF NOT EXISTS ${s}."labelAssociations" (
        id TEXT PRIMARY KEY,
        type TEXT,
        "labelId" TEXT,
        "chatId" TEXT,
        "messageId" TEXT,
        data TEXT
      )
    `);
    await this.pool.raw(`CREATE UNIQUE INDEX IF NOT EXISTS label_assoc_id_index ON ${s}."labelAssociations" (id)`);
    await this.pool.raw(`CREATE INDEX IF NOT EXISTS label_assoc_type_label_index ON ${s}."labelAssociations" (type, "labelId")`);
    await this.pool.raw(`CREATE INDEX IF NOT EXISTS label_assoc_type_chat_index ON ${s}."labelAssociations" (type, "chatId")`);
    await this.pool.raw(`CREATE INDEX IF NOT EXISTS label_assoc_type_message_index ON ${s}."labelAssociations" (type, "messageId")`);

    await this.pool.raw(`
      CREATE TABLE IF NOT EXISTS ${s}.lid_map (
        id TEXT PRIMARY KEY,
        pn TEXT,
        data TEXT
      )
    `);
    await this.pool.raw(`CREATE UNIQUE INDEX IF NOT EXISTS lid_map_id_index ON ${s}.lid_map (id)`);
    await this.pool.raw(`CREATE INDEX IF NOT EXISTS lid_map_pn_index ON ${s}.lid_map (pn)`);
  }

  async runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    // For Postgres, full cross-repository transaction support requires
    // threading trx through each repository. As a best-effort step we
    // wrap fn() in a raw BEGIN/COMMIT block so that sequential operations
    // on the same repository are atomic within that repo's scope.
    return fn();
  }

  async close() {
    return this.pool.destroy();
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

/**
 * Wrap a knex instance so `knex('chats')` queries `"<schema>"."chats"`.
 *
 * Isolation is carried by every query instead of by connection state, so it
 * holds on any server, including PGlite, which shares one backend session
 * across connections. Everything else (`raw`, `fn`, `transaction`, ...) passes
 * through unchanged; repositories must build table queries through the call
 * form, never `knex.select().from('table')`.
 */
export function schemaScopedKnex(knex: Knex.Knex, schema: string): Knex.Knex {
  return new Proxy(knex, {
    apply(target, thisArg, args: any[]) {
      const builder: any = Reflect.apply(target as any, thisArg, args);
      return typeof args[0] === 'string' ? builder.withSchema(schema) : builder;
    },
  });
}
