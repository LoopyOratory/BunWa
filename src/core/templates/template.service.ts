import { Database } from 'bun:sqlite';
import pino from 'pino';
import { injectable } from 'tsyringe';

const logger = pino({ name: 'TemplateService' });

const NAME_MAX_LENGTH = 100;
const BODY_MAX_LENGTH = 4096;
const HEADER_FOOTER_MAX_LENGTH = 1024;

export interface TemplateCreateDto {
  name: string;
  body: string;
  header?: string | null;
  footer?: string | null;
}

export interface TemplateUpdateDto {
  name?: string;
  body?: string;
  header?: string | null;
  footer?: string | null;
}

export interface Template {
  id: string;
  sessionId: string;
  name: string;
  body: string;
  header: string | null;
  footer: string | null;
  createdAt: string;
  updatedAt: string;
}

function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Message template service ported from OpenWA's template.service.ts.
 * Uses bun:sqlite for CRUD operations, variable substitution ({{name}}),
 * template validation, and preview rendering.
 *
 * Configurable via environment variables:
 *   WAHA_STORAGE_DIR — Directory for templates.db (default: './data')
 */
@injectable()
export class TemplateService {
  private db: Database;

  constructor(dbOrPath?: Database | string) {
    if (typeof dbOrPath === 'string') {
      this.db = new Database(`${dbOrPath}/templates.db`);
    } else if (dbOrPath instanceof Database) {
      this.db = dbOrPath;
    } else {
      const storageDir = process.env.WAHA_STORAGE_DIR ?? './data';
      this.db = new Database(`${storageDir}/templates.db`);
    }

    this.db.run('PRAGMA journal_mode = WAL');
    this.initSchema();
  }

  private initSchema(): void {
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

  /**
   * Validate template fields. Throws if invalid.
   */
  private validate(dto: TemplateCreateDto | TemplateUpdateDto, isCreate = false): void {
    if (isCreate || dto.name !== undefined) {
      if (!dto.name || typeof dto.name !== 'string' || dto.name.trim().length === 0) {
        throw new Error('Template name is required');
      }
      if (dto.name.length > NAME_MAX_LENGTH) {
        throw new Error(`Template name must be at most ${NAME_MAX_LENGTH} characters`);
      }
    }
    if (isCreate || dto.body !== undefined) {
      if (!dto.body || typeof dto.body !== 'string' || dto.body.trim().length === 0) {
        throw new Error('Template body is required');
      }
      if (dto.body.length > BODY_MAX_LENGTH) {
        throw new Error(`Template body must be at most ${BODY_MAX_LENGTH} characters`);
      }
    }
    if (dto.header !== undefined && dto.header !== null && dto.header.length > HEADER_FOOTER_MAX_LENGTH) {
      throw new Error(`Template header must be at most ${HEADER_FOOTER_MAX_LENGTH} characters`);
    }
    if (dto.footer !== undefined && dto.footer !== null && dto.footer.length > HEADER_FOOTER_MAX_LENGTH) {
      throw new Error(`Template footer must be at most ${HEADER_FOOTER_MAX_LENGTH} characters`);
    }
  }

  /**
   * Check if an error is a UNIQUE constraint violation (SQLite or PostgreSQL).
   */
  private isUniqueViolation(err: unknown): boolean {
    const e = err as { code?: string; message?: string; driverError?: { code?: string } };
    return (
      e?.code === '23505' ||
      e?.driverError?.code === '23505' ||
      e?.code === 'SQLITE_CONSTRAINT' ||
      e?.driverError?.code === 'SQLITE_CONSTRAINT' ||
      (typeof e?.message === 'string' && /unique constraint/i.test(e.message))
    );
  }

  /**
   * Create a new template for a session.
   */
  async create(sessionId: string, dto: TemplateCreateDto): Promise<Template> {
    this.validate(dto, true);

    const now = new Date().toISOString();
    const template: Template = {
      id: generateId(),
      sessionId,
      name: dto.name.trim(),
      body: dto.body,
      header: dto.header ?? null,
      footer: dto.footer ?? null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      this.db.run(
        `INSERT INTO templates (id, sessionId, name, body, header, footer, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [template.id, template.sessionId, template.name, template.body,
         template.header, template.footer, template.createdAt, template.updatedAt],
      );
      logger.info({ sessionId, templateId: template.id, name: template.name }, 'Template created');
      return template;
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new Error(`A template named '${dto.name}' already exists for this session`);
      }
      throw err;
    }
  }

  /**
   * Find all templates for a session.
   */
  async findBySession(sessionId: string): Promise<Template[]> {
    return this.db
      .query(`SELECT * FROM templates WHERE sessionId = ? ORDER BY createdAt DESC`)
      .all(sessionId) as Template[];
  }

  /**
   * Find a template by id within a session.
   */
  async findOne(sessionId: string, id: string): Promise<Template> {
    const template = this.db
      .query(`SELECT * FROM templates WHERE id = ? AND sessionId = ?`)
      .get(id, sessionId) as Template | undefined;

    if (!template) {
      throw new Error(`Template with id '${id}' not found`);
    }
    return template;
  }

  /**
   * Resolve a template for a session by id or by name.
   * Used by the send-template message flow.
   */
  async resolve(
    sessionId: string,
    identifier: { templateId?: string; templateName?: string },
  ): Promise<Template> {
    const { templateId, templateName } = identifier;

    if (templateId) {
      return this.findOne(sessionId, templateId);
    }

    if (templateName) {
      const template = this.db
        .query(`SELECT * FROM templates WHERE name = ? AND sessionId = ? ORDER BY createdAt ASC`)
        .get(templateName, sessionId) as Template | undefined;

      if (!template) {
        throw new Error(`Template with name '${templateName}' not found`);
      }
      return template;
    }

    throw new Error('Either templateId or templateName must be provided');
  }

  /**
   * Update a template. Only provided fields are updated.
   */
  async update(sessionId: string, id: string, dto: TemplateUpdateDto): Promise<Template> {
    const template = await this.findOne(sessionId, id);

    if (dto.name !== undefined) template.name = dto.name.trim();
    if (dto.body !== undefined) template.body = dto.body;
    if (dto.header !== undefined) template.header = dto.header;
    if (dto.footer !== undefined) template.footer = dto.footer;
    template.updatedAt = new Date().toISOString();

    this.validate({ name: template.name, body: template.body }, false);

    try {
      this.db.run(
        `UPDATE templates SET name = ?, body = ?, header = ?, footer = ?, updatedAt = ? WHERE id = ? AND sessionId = ?`,
        [template.name, template.body, template.header, template.footer, template.updatedAt, id, sessionId],
      );
      return template;
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new Error(`A template named '${template.name}' already exists for this session`);
      }
      throw err;
    }
  }

  /**
   * Delete a template.
   */
  async delete(sessionId: string, id: string): Promise<void> {
    await this.findOne(sessionId, id); // throws if not found
    this.db.run(`DELETE FROM templates WHERE id = ? AND sessionId = ?`, [id, sessionId]);
    logger.info({ sessionId, templateId: id }, 'Template deleted');
  }

  /**
   * Substitute {{variable}} placeholders in a template string.
   * Variables are case-sensitive and support nested dot notation for objects.
   */
  render(templateString: string, variables: Record<string, unknown>): string {
    return templateString.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, varName: string) => {
      const keys = varName.split('.');
      let value: unknown = variables;
      for (const key of keys) {
        if (value === null || value === undefined) return match;
        value = (value as Record<string, unknown>)[key];
      }
      return value === undefined || value === null ? match : String(value);
    });
  }

  /**
   * Render a full template (header + body + footer) with variable substitution.
   * Returns the combined rendered message.
   */
  preview(template: Template, variables: Record<string, unknown>): string {
    const parts: string[] = [];
    if (template.header) parts.push(this.render(template.header, variables));
    parts.push(this.render(template.body, variables));
    if (template.footer) parts.push(this.render(template.footer, variables));
    return parts.join('\n');
  }

  /**
   * Get all variable names referenced in a template.
   */
  extractVariables(templateString: string): string[] {
    const vars = new Set<string>();
    const regex = /\{\{(\w+(?:\.\w+)*)\}\}/g;
    let match;
    while ((match = regex.exec(templateString)) !== null) {
      vars.add(match[1]);
    }
    return Array.from(vars).sort();
  }
}
