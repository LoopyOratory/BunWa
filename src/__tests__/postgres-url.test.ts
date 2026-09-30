import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { buildPostgresUrl } from '../core/db/postgres-url';
import { WhatsappConfigService } from '../config.service';

describe('buildPostgresUrl', () => {
  it('builds a full URL with credentials', () => {
    expect(
      buildPostgresUrl({ host: 'db.local', port: '5433', username: 'waha', password: 's3cret', name: 'waha' }), // ggignore
    ).toBe('postgres://waha:s3cret@db.local:5433/waha');
  });

  it('omits an empty password', () => {
    expect(buildPostgresUrl({ host: 'h', username: 'u', name: 'n' })).toBe('postgres://u@h:5432/n');
  });

  it('omits credentials when no username is set', () => {
    expect(buildPostgresUrl({ host: 'h', name: 'n' })).toBe('postgres://h:5432/n');
  });

  it('appends sslmode and percent-encodes credentials', () => {
    expect(
      buildPostgresUrl({ host: 'h', username: 'a@b', password: 'p:w', name: 'n', ssl: true }),
    ).toBe('postgres://a%40b:p%3Aw@h:5432/n?sslmode=require');
  });

  it('falls back to localhost/postgres when fields are empty', () => {
    expect(buildPostgresUrl({})).toBe('postgres://localhost:5432/postgres');
  });
});

/**
 * The Infrastructure page used to save only WAHA_DB_* keys, which the runtime
 * never read: choosing PostgreSQL in the dashboard silently kept SQLite.
 * These lock in the resolution chain: explicit canonical keys win, then the
 * dashboard fields, then sqlite.
 */
describe('WhatsappConfigService database resolution', () => {
  const svc = new WhatsappConfigService();
  const ENV_KEYS = [
    'WAHA_DATABASE_DRIVER',
    'WAHA_DATABASE_URL',
    'WHATSAPP_SESSIONS_POSTGRESQL_URL',
    'WAHA_DB_TYPE',
    'WAHA_DB_HOST',
    'WAHA_DB_PORT',
    'WAHA_DB_USERNAME',
    'WAHA_DB_PASSWORD',
    'WAHA_DB_NAME',
    'WAHA_DB_SSL',
  ];
  const original = new Map<string, string | undefined>();

  beforeAll(() => {
    for (const key of ENV_KEYS) original.set(key, process.env[key]);
  });
  afterAll(() => {
    for (const key of ENV_KEYS) {
      const value = original.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('defaults to sqlite with no Postgres URL', () => {
    expect(svc.getDatabaseDriver()).toBe('sqlite');
    expect(svc.getSessionPostgresUrl()).toBeUndefined();
  });

  it('honours WAHA_DATABASE_DRIVER explicitly (case-insensitive)', () => {
    process.env.WAHA_DATABASE_DRIVER = 'POSTGRES';
    expect(svc.getDatabaseDriver()).toBe('postgres');
  });

  it('falls back to the Infrastructure page selection (WAHA_DB_TYPE)', () => {
    process.env.WAHA_DB_TYPE = 'postgres';
    expect(svc.getDatabaseDriver()).toBe('postgres');
  });

  it('builds the connection URL from the dashboard fields when no explicit URL exists', () => {
    process.env.WAHA_DB_TYPE = 'postgres';
    process.env.WAHA_DB_HOST = 'pg.local';
    process.env.WAHA_DB_PORT = '5433';
    process.env.WAHA_DB_USERNAME = 'u';
    process.env.WAHA_DB_PASSWORD = 'p';
    process.env.WAHA_DB_NAME = 'waha';
    expect(svc.getSessionPostgresUrl()).toBe('postgres://u:p@pg.local:5433/waha');
  });

  it('prefers an explicit URL over the field-built fallback', () => {
    process.env.WAHA_DB_TYPE = 'postgres';
    process.env.WAHA_DB_HOST = 'pg.local';
    process.env.WAHA_DB_NAME = 'waha';
    process.env.WAHA_DATABASE_URL = 'postgres://explicit@host/db';
    expect(svc.getSessionPostgresUrl()).toBe('postgres://explicit@host/db');
  });

  it('does not invent a URL for an explicit driver without dashboard fields', () => {
    // The factory is expected to fail loudly in this case (missing URL), not
    // silently dial localhost.
    process.env.WAHA_DATABASE_DRIVER = 'postgres';
    expect(svc.getSessionPostgresUrl()).toBeUndefined();
  });

  it('never invents a Postgres URL while the driver is sqlite', () => {
    process.env.WAHA_DB_TYPE = 'sqlite';
    process.env.WAHA_DB_HOST = 'pg.local';
    expect(svc.getSessionPostgresUrl()).toBeUndefined();
  });
});
