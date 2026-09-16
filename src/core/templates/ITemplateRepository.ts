import type { Template } from './template.types';

/**
 * Persistence contract for message templates.
 *
 * The service owns validation and rendering; the repository only moves rows.
 * Implementations exist for SQLite (bun:sqlite) and PostgreSQL (knex/pg), and
 * are selected by TemplateRepositoryFactory from WAHA_DATABASE_DRIVER so
 * templates follow the same database as sessions, messages and media.
 */
export interface ITemplateRepository {
  /**
   * Create the table and indexes if they do not exist.
   */
  init(): Promise<void>;

  create(template: Template): Promise<Template>;

  findBySession(sessionId: string): Promise<Template[]>;

  findOne(sessionId: string, id: string): Promise<Template | undefined>;

  findByName(sessionId: string, name: string): Promise<Template | undefined>;

  update(template: Template): Promise<Template>;

  delete(sessionId: string, id: string): Promise<void>;
}
