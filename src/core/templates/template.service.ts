import type { Database } from 'bun:sqlite';
import pino from 'pino';
import { injectable } from 'tsyringe';
import { TemplateRepositoryFactory } from './TemplateRepositoryFactory';
import type { ITemplateRepository } from './ITemplateRepository';
import type { Template, TemplateCreateDto, TemplateUpdateDto } from './template.types';

export type { Template, TemplateCreateDto, TemplateUpdateDto } from './template.types';

const logger = pino({ name: 'TemplateService' });

const NAME_MAX_LENGTH = 100;
const BODY_MAX_LENGTH = 4096;
const HEADER_FOOTER_MAX_LENGTH = 1024;

function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Message template service ported from OpenWA's template.service.ts.
 * Validation, variable substitution ({{name}}) and preview rendering live
 * here; persistence sits behind ITemplateRepository so templates follow the
 * configured database (SQLite file or PostgreSQL) instead of always writing
 * a local templates.db that is lost when the container is replaced.
 *
 * Configurable via environment variables:
 *   WAHA_DATABASE_DRIVER — 'postgres'/'postgresql' for PostgreSQL, else SQLite
 *   WAHA_STORAGE_DIR     — Directory for templates.db when using SQLite (default: './data')
 */
@injectable()
export class TemplateService {
  private readonly repository: ITemplateRepository;
  /** Resolves once the repository schema exists; every operation awaits it. */
  private readonly ready: Promise<void>;

  constructor(dbOrPath?: Database | string) {
    this.repository = new TemplateRepositoryFactory().create(dbOrPath);
    this.ready = this.repository.init();
    // The constructor stays synchronous, so a rejected init would otherwise be
    // an unhandled rejection before the first operation observes it.
    this.ready.catch(() => {});
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
      await this.ready;
      await this.repository.create(template);
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
    await this.ready;
    return this.repository.findBySession(sessionId);
  }

  /**
   * Find a template by id within a session.
   */
  async findOne(sessionId: string, id: string): Promise<Template> {
    await this.ready;
    const template = await this.repository.findOne(sessionId, id);

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
      await this.ready;
      const template = await this.repository.findByName(sessionId, templateName);

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
      await this.repository.update(template);
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
    await this.repository.delete(sessionId, id);
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
