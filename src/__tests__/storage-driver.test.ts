import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { container } from 'tsyringe';
import pg from 'pg';
import { WhatsappConfigService, ACCEPTED_DATABASE_DRIVERS } from '../config.service';
import { NowebStorageFactoryCore } from '../core/engines/noweb/store/NowebStorageFactoryCore';
import { PostgresStorage } from '../core/engines/noweb/store/postgres/PostgresStorage';
import { Sqlite3Storage } from '../core/engines/noweb/store/sqlite3/Sqlite3Storage';
import { TemplateRepositoryFactory } from '../core/templates/TemplateRepositoryFactory';
import { PostgresTemplateRepository } from '../core/templates/postgres/PostgresTemplateRepository';
import { Sqlite3TemplateRepository } from '../core/templates/sqlite3/Sqlite3TemplateRepository';
import { LocalStoreCore } from '../core/storage/LocalStoreCore';
import { describeStorage, redactPostgresUrl } from '../core/storage/storage-report';
import { verifyStorageAtBoot } from '../core/storage/storage-bootstrap';

/**
 * The driver switch used to treat every unrecognised value as SQLite in both
 * factories, so a typo (or the advertised-but-unimplemented mongo) silently
 * left the app on SQLite with no log line explaining it. These tests pin the
 * loud behaviour: accepted values normalise, everything else throws, and the
 * boot report names the resolved store.
 */

const PG_URL = 'postgres://user:s3cret@db.local:5433/waha';
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
  'WAHA_STORAGE_DIR',
  'WAHA_LOCAL_STORE_BASE_DIR',
] as const;

const savedEnv = new Map<string, string | undefined>();
const tempDirs: string[] = [];
const svc = new WhatsappConfigService();

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bunwa-driver-'));
  tempDirs.push(dir);
  return dir;
}

beforeAll(() => {
  for (const key of ENV_KEYS) {
    savedEnv.set(key, process.env[key]);
  }
  container.registerInstance(WhatsappConfigService, svc);
});

beforeEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
  process.env.WAHA_STORAGE_DIR = makeTempDir();
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

describe('getDatabaseDriver: accepted values', () => {
  it('normalises postgresql with padding and casing', () => {
    process.env.WAHA_DATABASE_DRIVER = 'postgresql ';
    expect(svc.getDatabaseDriver()).toBe('postgres');
  });

  it('normalises Postgres casing', () => {
    process.env.WAHA_DATABASE_DRIVER = 'Postgres';
    expect(svc.getDatabaseDriver()).toBe('postgres');
  });

  it('accepts sqlite case-insensitively', () => {
    process.env.WAHA_DATABASE_DRIVER = 'SQLITE';
    expect(svc.getDatabaseDriver()).toBe('sqlite');
  });

  it('defaults to sqlite when unset', () => {
    expect(svc.getDatabaseDriver()).toBe('sqlite');
  });

  it('defaults to sqlite for an empty value', () => {
    process.env.WAHA_DATABASE_DRIVER = '';
    expect(svc.getDatabaseDriver()).toBe('sqlite');
  });

  it('honours the WAHA_DB_TYPE dashboard fallback', () => {
    process.env.WAHA_DB_TYPE = 'postgres';
    expect(svc.getDatabaseDriver()).toBe('postgres');
  });
});

describe('getDatabaseDriver: unknown values are startup errors', () => {
  it('rejects pg, naming the value and the accepted list', () => {
    process.env.WAHA_DATABASE_DRIVER = 'pg';
    expect(() => svc.getDatabaseDriver()).toThrow(
      new RegExp(`Unsupported WAHA_DATABASE_DRIVER value 'pg'.*${ACCEPTED_DATABASE_DRIVERS.join(', ')}`),
    );
    expect(() => svc.getDatabaseDriver()).toThrow(/Refusing to fall back to sqlite/);
  });

  it('rejects mysql', () => {
    process.env.WAHA_DATABASE_DRIVER = 'mysql';
    expect(() => svc.getDatabaseDriver()).toThrow(/Unsupported WAHA_DATABASE_DRIVER value 'mysql'/);
  });

  it('rejects mongo as not implemented rather than degrading to sqlite', () => {
    process.env.WAHA_DATABASE_DRIVER = 'mongo';
    expect(() => svc.getDatabaseDriver()).toThrow(/MongoDB is not implemented/);
  });

  it('rejects an unknown WAHA_DB_TYPE when no driver is set', () => {
    process.env.WAHA_DB_TYPE = 'mysql';
    expect(() => svc.getDatabaseDriver()).toThrow(/Unsupported WAHA_DB_TYPE value 'mysql'/);
  });
});

describe('factories never fall back to SQLite', () => {
  it('template factory throws for pg instead of returning SQLite', () => {
    process.env.WAHA_DATABASE_DRIVER = 'pg';
    expect(() => new TemplateRepositoryFactory().create()).toThrow(/Unsupported WAHA_DATABASE_DRIVER/);
  });

  it('session store factory throws for mysql instead of returning SQLite', () => {
    process.env.WAHA_DATABASE_DRIVER = 'mysql';
    const store = new LocalStoreCore();
    expect(() => new NowebStorageFactoryCore().createStorage(store, 'default')).toThrow(
      /Unsupported WAHA_DATABASE_DRIVER/,
    );
  });

  it('returns SQLite for the sqlite driver', async () => {
    process.env.WAHA_DATABASE_DRIVER = 'sqlite';
    expect(new TemplateRepositoryFactory().create()).toBeInstanceOf(Sqlite3TemplateRepository);

    const store = new LocalStoreCore();
    await store.init('default');
    const storage = new NowebStorageFactoryCore().createStorage(store, 'default');
    expect(storage).toBeInstanceOf(Sqlite3Storage);
    await storage.close();
  });

  it('returns Postgres for the postgres driver when a URL is set', async () => {
    process.env.WAHA_DATABASE_DRIVER = 'postgres';
    process.env.WAHA_DATABASE_URL = PG_URL;

    expect(new TemplateRepositoryFactory().create()).toBeInstanceOf(PostgresTemplateRepository);

    const storage = new NowebStorageFactoryCore().createStorage(new LocalStoreCore(), 'default');
    expect(storage).toBeInstanceOf(PostgresStorage);
    // Each session's store lives in its own schema, never the shared public one.
    expect((storage as PostgresStorage).schema).toBe('bunwa_default');
    await storage.close();
  });

  it('throws for postgres without a connection URL', () => {
    process.env.WAHA_DATABASE_DRIVER = 'postgres';
    expect(() => new TemplateRepositoryFactory().create()).toThrow(
      'WAHA_DATABASE_URL is required for PostgreSQL driver',
    );
    expect(() => new NowebStorageFactoryCore().createStorage(new LocalStoreCore(), 'default')).toThrow(
      'WAHA_DATABASE_URL is required for PostgreSQL driver',
    );
  });
});

describe('describeStorage', () => {
  it('renders the sqlite driver and every concrete target', () => {
    process.env.WAHA_DATABASE_DRIVER = 'sqlite';
    process.env.WAHA_STORAGE_DIR = '/var/lib/bunwa/data';
    process.env.WAHA_LOCAL_STORE_BASE_DIR = '/var/lib/bunwa/.sessions';

    const report = describeStorage(svc);
    expect(report).toContain('driver=sqlite');
    expect(report).toContain('sessions-auth=sqlite /var/lib/bunwa/.sessions');
    expect(report).toContain('sessions-chat=sqlite /var/lib/bunwa/.sessions/noweb/<session>/store.sqlite3');
    expect(report).toContain('templates=sqlite /var/lib/bunwa/data/templates.db');
    expect(report).toContain('audit=sqlite /var/lib/bunwa/data/audit.db');
    expect(report).toContain('sending-policy=sqlite /var/lib/bunwa/data/sending-limits.db');
  });

  it('renders the postgres driver with host, port, database and a redacted password', () => {
    process.env.WAHA_DATABASE_DRIVER = 'postgres';
    process.env.WAHA_DATABASE_URL = PG_URL;

    const report = describeStorage(svc);
    expect(report).toContain('driver=postgres');
    expect(report).toContain('db.local:5433/waha');
    expect(report).not.toContain('s3cret');
    expect(report).toContain(':***@db.local');
    // Audit and the sending policy ledger stay local by design.
    expect(report).toContain('audit=sqlite');
    expect(report).toContain('sending-policy=sqlite');
  });

  it('flags a postgres driver with no connection URL', () => {
    process.env.WAHA_DATABASE_DRIVER = 'postgres';
    expect(describeStorage(svc)).toContain('connection URL not configured');
  });
});

describe('redactPostgresUrl', () => {
  it('removes the password and keeps the rest of the URL', () => {
    const redacted = redactPostgresUrl(PG_URL);
    expect(redacted).toBe('postgres://user:***@db.local:5433/waha');
    expect(redacted).not.toContain('s3cret');
  });

  it('keeps URLs that carry no password', () => {
    expect(redactPostgresUrl('postgres://host:5432/db')).toBe('postgres://host:5432/db');
  });

  it('redacts even when the URL cannot be parsed', () => {
    const redacted = redactPostgresUrl('postgres://user:p@ss@host:5432/db');
    expect(redacted).not.toContain('p@ss');
    expect(redacted).toContain('***@');
  });
});

describe('verifyStorageAtBoot (sqlite)', () => {
  it('creates the templates table eagerly without a server', async () => {
    process.env.WAHA_DATABASE_DRIVER = 'sqlite';
    const storageDir = process.env.WAHA_STORAGE_DIR!;

    await verifyStorageAtBoot(svc);

    const dbPath = join(storageDir, 'templates.db');
    expect(existsSync(dbPath)).toBe(true);
    const db = new Database(dbPath, { readonly: true });
    try {
      const table = db
        .query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'templates'`)
        .get() as { name: string } | null;
      expect(table?.name).toBe('templates');
    } finally {
      db.close();
    }
  });

  it('fails fast for postgres when the connection URL is missing', async () => {
    process.env.WAHA_DATABASE_DRIVER = 'postgres';
    await expect(verifyStorageAtBoot(svc)).rejects.toThrow(
      /WAHA_DATABASE_DRIVER=postgres requires a connection URL/,
    );
  });

  it('fails fast with the real error when postgres is unreachable', async () => {
    process.env.WAHA_DATABASE_DRIVER = 'postgres';
    // Port 1 on loopback: connection refused immediately, no timeout wait.
    process.env.WAHA_DATABASE_URL = 'postgres://user:pass@127.0.0.1:1/nope';
    await expect(verifyStorageAtBoot(svc)).rejects.toThrow(/ECONNREFUSED/);
  });
});

/**
 * Integration test against a real Postgres (or PGlite socket server). Skipped
 * cleanly when BUNWA_TEST_POSTGRES_URL is unset:
 *   BUNWA_TEST_POSTGRES_URL=postgres://user:pass@host:5432/db bun test
 */
const POSTGRES_TEST_URL = process.env.BUNWA_TEST_POSTGRES_URL;
describe.skipIf(!POSTGRES_TEST_URL)('verifyStorageAtBoot (postgres integration)', () => {
  it('connects, creates the template table, and leaves session stores to session start', async () => {
    process.env.WAHA_DATABASE_DRIVER = 'postgres';
    process.env.WAHA_DATABASE_URL = POSTGRES_TEST_URL!;

    await verifyStorageAtBoot(svc);

    const client = new pg.Client({ connectionString: POSTGRES_TEST_URL });
    await client.connect();
    try {
      const result = await client.query(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
      );
      const tables = result.rows.map((row: { tablename: string }) => row.tablename);
      expect(tables).toContain('templates');
    } finally {
      await client.end();
    }
  });
});
