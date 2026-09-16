import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { container } from 'tsyringe';
import { WhatsappConfigService } from '../config.service';
import { TemplateRepositoryFactory } from '../core/templates/TemplateRepositoryFactory';
import { PostgresTemplateRepository } from '../core/templates/postgres/PostgresTemplateRepository';
import { Sqlite3TemplateRepository } from '../core/templates/sqlite3/Sqlite3TemplateRepository';
import { TemplateService } from '../core/templates/template.service';
import type { Template } from '../core/templates/template.types';

/**
 * Templates used to live in their own bun:sqlite file regardless of
 * WAHA_DATABASE_DRIVER, so on a Postgres deployment they were lost with the
 * container while sessions/messages/media survived. These tests cover the
 * repository split: SQLite round-trips, driver selection, and the unchanged
 * TemplateService public behaviour.
 */

const ENV_KEYS = [
  'WAHA_DATABASE_DRIVER',
  'WAHA_STORAGE_DIR',
  'WAHA_DATABASE_URL',
  'WHATSAPP_SESSIONS_POSTGRESQL_URL',
] as const;

const savedEnv = new Map<string, string | undefined>();
const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bunwa-templates-'));
  tempDirs.push(dir);
  return dir;
}

function makeTemplate(overrides: Partial<Template> = {}): Template {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    sessionId: 'session-1',
    name: 'welcome',
    body: 'Hello {{name}}',
    header: null,
    footer: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeAll(() => {
  for (const key of ENV_KEYS) {
    savedEnv.set(key, process.env[key]);
  }
  // The factory resolves its config exactly like NowebStorageFactoryCore.
  container.registerInstance(WhatsappConfigService, new WhatsappConfigService());
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('Sqlite3TemplateRepository', () => {
  it('round-trips create, find, update and delete', async () => {
    const dir = makeTempDir();
    const repo = new Sqlite3TemplateRepository(dir);
    await repo.init();

    expect(existsSync(join(dir, 'templates.db'))).toBe(true);

    const template = makeTemplate();
    expect(await repo.create(template)).toEqual(template);
    expect(await repo.findBySession('session-1')).toEqual([template]);
    expect(await repo.findBySession('other-session')).toEqual([]);
    expect(await repo.findOne('session-1', template.id)).toEqual(template);
    expect(await repo.findOne('session-1', 'missing-id')).toBeUndefined();
    expect(await repo.findByName('session-1', 'welcome')).toEqual(template);
    expect(await repo.findByName('session-1', 'missing-name')).toBeUndefined();

    const updated: Template = {
      ...template,
      name: 'welcome-v2',
      body: 'Updated {{name}}',
      header: 'Hi {{name}}',
      footer: 'Bye',
      updatedAt: new Date().toISOString(),
    };
    expect(await repo.update(updated)).toEqual(updated);
    expect(await repo.findOne('session-1', template.id)).toEqual(updated);

    await repo.delete('session-1', template.id);
    expect(await repo.findOne('session-1', template.id)).toBeUndefined();
    expect(await repo.findBySession('session-1')).toEqual([]);
  });

  it('enforces UNIQUE(sessionId, name)', async () => {
    const repo = new Sqlite3TemplateRepository(makeTempDir());
    await repo.init();

    const template = makeTemplate({ name: 'duplicate' });
    await repo.create(template);

    await expect(
      repo.create({ ...template, id: crypto.randomUUID() }),
    ).rejects.toThrow(/unique constraint/i);

    // The same name is fine in another session.
    const otherSession = makeTemplate({ sessionId: 'session-2', name: 'duplicate' });
    await repo.create(otherSession);
    expect(await repo.findByName('session-2', 'duplicate')).toEqual(otherSession);
  });

  it('accepts an already-open Database handle', async () => {
    const db = new Database(':memory:');
    try {
      const repo = new Sqlite3TemplateRepository(db);
      await repo.init();
      const template = makeTemplate();
      await repo.create(template);
      expect(await repo.findOne('session-1', template.id)).toEqual(template);
    } finally {
      db.close();
    }
  });
});

describe('TemplateRepositoryFactory', () => {
  it('returns SQLite when WAHA_DATABASE_DRIVER is unset', () => {
    delete process.env.WAHA_DATABASE_DRIVER;
    expect(new TemplateRepositoryFactory().create()).toBeInstanceOf(Sqlite3TemplateRepository);
  });

  it('returns SQLite for the sqlite driver', () => {
    process.env.WAHA_DATABASE_DRIVER = 'sqlite';
    expect(new TemplateRepositoryFactory().create()).toBeInstanceOf(Sqlite3TemplateRepository);
  });

  it('returns PostgreSQL for the postgres driver', () => {
    process.env.WAHA_DATABASE_DRIVER = 'postgres';
    process.env.WAHA_DATABASE_URL = 'postgres://user:pass@127.0.0.1:5432/not_a_real_db';
    delete process.env.WHATSAPP_SESSIONS_POSTGRESQL_URL;

    // Constructing the pool does not connect, so no live database is required.
    expect(new TemplateRepositoryFactory().create()).toBeInstanceOf(PostgresTemplateRepository);
  });

  it('returns PostgreSQL for the postgresql driver', () => {
    process.env.WAHA_DATABASE_DRIVER = 'postgresql';
    process.env.WAHA_DATABASE_URL = 'postgres://user:pass@127.0.0.1:5432/not_a_real_db';
    delete process.env.WHATSAPP_SESSIONS_POSTGRESQL_URL;

    expect(new TemplateRepositoryFactory().create()).toBeInstanceOf(PostgresTemplateRepository);
  });

  it('throws when postgres is selected without a connection URL', () => {
    process.env.WAHA_DATABASE_DRIVER = 'postgres';
    delete process.env.WAHA_DATABASE_URL;
    delete process.env.WHATSAPP_SESSIONS_POSTGRESQL_URL;

    expect(() => new TemplateRepositoryFactory().create()).toThrow(
      'WAHA_DATABASE_URL is required for PostgreSQL driver',
    );
  });

  it('an injected directory or handle always means SQLite, even on the postgres driver', () => {
    process.env.WAHA_DATABASE_DRIVER = 'postgres';
    process.env.WAHA_DATABASE_URL = 'postgres://user:pass@127.0.0.1:5432/not_a_real_db';

    expect(new TemplateRepositoryFactory().create(makeTempDir())).toBeInstanceOf(Sqlite3TemplateRepository);

    const db = new Database(':memory:');
    try {
      expect(new TemplateRepositoryFactory().create(db)).toBeInstanceOf(Sqlite3TemplateRepository);
    } finally {
      db.close();
    }
  });
});

describe('TemplateService persistence', () => {
  it('creates the storage directory and templates.db on first boot', async () => {
    const storageDir = join(makeTempDir(), 'nested', 'data');
    process.env.WAHA_STORAGE_DIR = storageDir;
    delete process.env.WAHA_DATABASE_DRIVER;

    const svc = new TemplateService();
    const created = await svc.create('session-1', { name: 'boot', body: 'hello' });

    expect(existsSync(join(storageDir, 'templates.db'))).toBe(true);
    expect(await svc.findOne('session-1', created.id)).toEqual(created);
  });

  it('keeps using SQLite when constructed with a directory path', async () => {
    const dir = makeTempDir();
    const svc = new TemplateService(dir);

    const created = await svc.create('session-1', { name: 'local', body: 'Hello {{name}}' });
    expect(existsSync(join(dir, 'templates.db'))).toBe(true);
    expect(await svc.findBySession('session-1')).toEqual([created]);
    expect(await svc.resolve('session-1', { templateName: 'local' })).toEqual(created);
  });

  it('keeps using SQLite when constructed with a Database handle', async () => {
    const db = new Database(':memory:');
    try {
      const svc = new TemplateService(db);
      const created = await svc.create('session-1', { name: 'in-memory', body: 'body' });
      expect(await svc.resolve('session-1', { templateId: created.id })).toEqual(created);
    } finally {
      db.close();
    }
  });

  it('update, delete and duplicate-name messages keep the old behaviour', async () => {
    const svc = new TemplateService(makeTempDir());
    const created = await svc.create('session-1', { name: 'greeting', body: 'Hi' });

    const updated = await svc.update('session-1', created.id, { body: 'Hello', footer: 'Bye' });
    expect(updated.body).toBe('Hello');
    expect(updated.footer).toBe('Bye');
    expect(await svc.findOne('session-1', created.id)).toEqual(updated);

    await expect(
      svc.create('session-1', { name: 'greeting', body: 'other' }),
    ).rejects.toThrow("A template named 'greeting' already exists for this session");

    await svc.delete('session-1', created.id);
    expect(await svc.findBySession('session-1')).toEqual([]);
  });

  it('keeps the exact not-found error messages', async () => {
    const svc = new TemplateService(makeTempDir());

    await expect(svc.findOne('session-1', 'missing-id')).rejects.toThrow(
      "Template with id 'missing-id' not found",
    );
    await expect(svc.resolve('session-1', { templateName: 'missing-name' })).rejects.toThrow(
      "Template with name 'missing-name' not found",
    );
    await expect(svc.resolve('session-1', {})).rejects.toThrow(
      'Either templateId or templateName must be provided',
    );
    await expect(svc.delete('session-1', 'missing-id')).rejects.toThrow(
      "Template with id 'missing-id' not found",
    );
  });
});

describe('TemplateService rendering', () => {
  const svc = new TemplateService(makeTempDir());

  it('render substitutes variables, including nested ones', () => {
    expect(svc.render('Hello {{name}}!', { name: 'Ada' })).toBe('Hello Ada!');
    expect(svc.render('Hi {{user.first}}', { user: { first: 'Ada' } })).toBe('Hi Ada');
    expect(svc.render('Count {{n}}', { n: 3 })).toBe('Count 3');
    expect(svc.render('Twice {{a}} {{a}}', { a: 'x' })).toBe('Twice x x');
  });

  it('render leaves unknown or missing variables untouched', () => {
    expect(svc.render('Hi {{missing}}', {})).toBe('Hi {{missing}}');
    expect(svc.render('Hi {{user.last}}', { user: { first: 'Ada' } })).toBe('Hi {{user.last}}');
    expect(svc.render('Hi {{user.last}}', { user: null })).toBe('Hi {{user.last}}');
  });

  it('preview joins header, body and footer in order', () => {
    const template = makeTemplate({
      header: 'Dear {{name}}',
      body: 'Body for {{name}}',
      footer: 'Regards',
    });
    expect(svc.preview(template, { name: 'Ada' })).toBe('Dear Ada\nBody for Ada\nRegards');

    expect(svc.preview(makeTemplate({ header: null, footer: null }), { name: 'Ada' })).toBe(
      'Hello Ada',
    );
  });

  it('extractVariables deduplicates and sorts', () => {
    expect(svc.extractVariables('{{b}} {{a}} {{b}} {{user.name}}')).toEqual(['a', 'b', 'user.name']);
    expect(svc.extractVariables('no variables here')).toEqual([]);
  });
});
