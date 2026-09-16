import Knex from 'knex';
import pino from 'pino';
import { ITemplateRepository } from '../ITemplateRepository';
import type { Template } from '../template.types';

const logger = pino({ name: 'PostgresTemplateRepository' });

/**
 * PostgreSQL persistence for message templates.
 *
 * Mirrors PostgresStorage: a knex/pg pool and raw `CREATE TABLE IF NOT EXISTS`
 * migrations. Identifiers are quoted so camelCase columns survive Postgres'
 * lower-casing, letting knex object syntax (which quotes) address them.
 */
export class PostgresTemplateRepository implements ITemplateRepository {
  private knex: Knex.Knex | null = null;

  constructor(private readonly connectionString: string) {}

  /**
   * Built on first use rather than in the constructor: creating a knex client
   * loads the pg driver and would fail at construction time, while callers
   * (the factory, tests) only pay for it when the database is actually used.
   */
  private getKnex(): Knex.Knex {
    if (!this.knex) {
      this.knex = Knex({
        client: 'pg',
        connection: this.connectionString,
        pool: {
          min: 2,
          max: 10,
          idleTimeoutMillis: 60_000,
          createTimeoutMillis: 120_000,
          acquireTimeoutMillis: 120_000,
        },
      });
    }
    return this.knex;
  }

  async init(): Promise<void> {
    await this.getKnex().raw(`
      CREATE TABLE IF NOT EXISTS templates (
        "id" TEXT PRIMARY KEY,
        "sessionId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "body" TEXT NOT NULL,
        "header" TEXT,
        "footer" TEXT,
        "createdAt" TEXT NOT NULL,
        "updatedAt" TEXT NOT NULL
      )
    `);
    await this.getKnex().raw(`CREATE UNIQUE INDEX IF NOT EXISTS templates_session_name_index ON templates ("sessionId", "name")`);
    await this.getKnex().raw(`CREATE INDEX IF NOT EXISTS idx_templates_session ON templates ("sessionId")`);
  }

  async create(template: Template): Promise<Template> {
    await this.getKnex()('templates').insert({
      id: template.id,
      sessionId: template.sessionId,
      name: template.name,
      body: template.body,
      header: template.header,
      footer: template.footer,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    });
    logger.debug({ sessionId: template.sessionId, templateId: template.id }, 'Template stored');
    return template;
  }

  async findBySession(sessionId: string): Promise<Template[]> {
    const rows = await this.getKnex()('templates')
      .where({ sessionId })
      .orderBy('createdAt', 'desc');
    return rows as Template[];
  }

  async findOne(sessionId: string, id: string): Promise<Template | undefined> {
    const row = await this.getKnex()('templates').where({ id, sessionId }).first();
    return row as Template | undefined;
  }

  async findByName(sessionId: string, name: string): Promise<Template | undefined> {
    const row = await this.getKnex()('templates')
      .where({ name, sessionId })
      .orderBy('createdAt', 'asc')
      .first();
    return row as Template | undefined;
  }

  async update(template: Template): Promise<Template> {
    await this.getKnex()('templates')
      .where({ id: template.id, sessionId: template.sessionId })
      .update({
        name: template.name,
        body: template.body,
        header: template.header,
        footer: template.footer,
        updatedAt: template.updatedAt,
      });
    return template;
  }

  async delete(sessionId: string, id: string): Promise<void> {
    await this.getKnex()('templates').where({ id, sessionId }).del();
  }
}
