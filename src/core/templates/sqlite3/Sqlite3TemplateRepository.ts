import { Database } from 'bun:sqlite';
import { mkdirSync } from 'fs';
import pino from 'pino';
import { ITemplateRepository } from '../ITemplateRepository';
import type { Template } from '../template.types';

const logger = pino({ name: 'Sqlite3TemplateRepository' });

/**
 * SQLite persistence for message templates.
 *
 * Accepts either an already-open Database handle (tests, callers that share a
 * connection) or a directory path. With neither, the file lives at
 * `${WAHA_STORAGE_DIR ?? './data'}/templates.db`, exactly as the service did
 * before the repository split.
 */
export class Sqlite3TemplateRepository implements ITemplateRepository {
  private readonly db: Database;

  constructor(dbOrPath?: Database | string) {
    const directory = typeof dbOrPath === 'string' ? dbOrPath : undefined;

    if (dbOrPath instanceof Database) {
      this.db = dbOrPath;
    } else {
      const storageDir = directory ?? process.env.WAHA_STORAGE_DIR ?? './data';
      // Auto-create the storage dir so fresh clones boot without a manual mkdir.
      mkdirSync(storageDir, { recursive: true });
      this.db = new Database(`${storageDir}/templates.db`);
    }

    this.db.run('PRAGMA journal_mode = WAL');
  }

  async init(): Promise<void> {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        sessionId TEXT NOT NULL,
        name TEXT NOT NULL,
        body TEXT NOT NULL,
        header TEXT,
        footer TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        UNIQUE(sessionId, name)
      )
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_templates_session ON templates(sessionId)`);
  }

  async create(template: Template): Promise<Template> {
    this.db.run(
      `INSERT INTO templates (id, sessionId, name, body, header, footer, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [template.id, template.sessionId, template.name, template.body,
       template.header, template.footer, template.createdAt, template.updatedAt],
    );
    logger.debug({ sessionId: template.sessionId, templateId: template.id }, 'Template stored');
    return template;
  }

  async findBySession(sessionId: string): Promise<Template[]> {
    return this.db
      .query(`SELECT * FROM templates WHERE sessionId = ? ORDER BY createdAt DESC`)
      .all(sessionId) as Template[];
  }

  async findOne(sessionId: string, id: string): Promise<Template | undefined> {
    // bun:sqlite's get() yields null when nothing matches; the contract is
    // undefined so both drivers behave identically.
    return (
      this.db
        .query(`SELECT * FROM templates WHERE id = ? AND sessionId = ?`)
        .get(id, sessionId) as Template | null
    ) ?? undefined;
  }

  async findByName(sessionId: string, name: string): Promise<Template | undefined> {
    return (
      this.db
        .query(`SELECT * FROM templates WHERE name = ? AND sessionId = ? ORDER BY createdAt ASC`)
        .get(name, sessionId) as Template | null
    ) ?? undefined;
  }

  async update(template: Template): Promise<Template> {
    this.db.run(
      `UPDATE templates SET name = ?, body = ?, header = ?, footer = ?, updatedAt = ? WHERE id = ? AND sessionId = ?`,
      [template.name, template.body, template.header, template.footer, template.updatedAt,
       template.id, template.sessionId],
    );
    return template;
  }

  async delete(sessionId: string, id: string): Promise<void> {
    this.db.run(`DELETE FROM templates WHERE id = ? AND sessionId = ?`, [id, sessionId]);
  }
}
