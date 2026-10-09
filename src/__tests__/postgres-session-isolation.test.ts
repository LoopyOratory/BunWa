import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import pg from 'pg';
import { PostgresStorage } from '../core/engines/noweb/store/postgres/PostgresStorage';
import { sessionSchemaName } from '../core/engines/noweb/store/postgres/session-schema';
import { NowebStorageFactoryCore } from '../core/engines/noweb/store/NowebStorageFactoryCore';
import { LocalStoreCore } from '../core/storage/LocalStoreCore';
import { verifyStorageAtBoot } from '../core/storage/storage-bootstrap';
import { WhatsappConfigService } from '../config.service';
import { startEmbeddedPostgres, type EmbeddedPostgres } from './conformance/embedded-postgres';

// On Postgres every NOWEB session used to share one set of tables with no
// session column, so a session's chat list showed every session's chats and a
// deleted session's rows stayed behind. Each session now has its own schema.

describe('sessionSchemaName', () => {
  it('prefixes the session name and keeps its case', () => {
    expect(sessionSchemaName('vivita')).toBe('bunwa_vivita');
    expect(sessionSchemaName('Vivita')).toBe('bunwa_Vivita');
    expect(sessionSchemaName('Vivita')).not.toBe(sessionSchemaName('vivita'));
  });

  it('keeps long names within the 63-byte identifier limit, unique and stable', () => {
    const a = 'a'.repeat(64);
    const b = 'a'.repeat(63) + 'b';
    expect(Buffer.byteLength(sessionSchemaName(a))).toBeLessThanOrEqual(63);
    expect(sessionSchemaName(a)).toBe(sessionSchemaName(a));
    expect(sessionSchemaName(a)).not.toBe(sessionSchemaName(b));
  });

  it('never splits a multi-byte character when shortening', () => {
    const name = 'é'.repeat(60);
    const schema = sessionSchemaName(name);
    expect(Buffer.byteLength(schema)).toBeLessThanOrEqual(63);
    expect(schema).not.toContain('�');
  });
});

describe('Postgres store isolation', () => {
  let embedded: EmbeddedPostgres;
  let url: string;
  const saved = {
    driver: process.env.WAHA_DATABASE_DRIVER,
    url: process.env.WAHA_DATABASE_URL,
  };

  beforeAll(async () => {
    embedded = await startEmbeddedPostgres();
    url = embedded.url;
  });

  afterAll(async () => {
    process.env.WAHA_DATABASE_DRIVER = saved.driver;
    process.env.WAHA_DATABASE_URL = saved.url;
    if (saved.driver === undefined) delete process.env.WAHA_DATABASE_DRIVER;
    if (saved.url === undefined) delete process.env.WAHA_DATABASE_URL;
    await embedded.stop();
  });

  async function schemas(): Promise<string[]> {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      const result = await client.query(`SELECT schema_name FROM information_schema.schemata`);
      return result.rows.map((row: { schema_name: string }) => row.schema_name);
    } finally {
      await client.end();
    }
  }

  it('keeps two sessions on one database from seeing each other', async () => {
    const alpha = new PostgresStorage(url, sessionSchemaName('alpha'));
    const beta = new PostgresStorage(url, sessionSchemaName('beta'));
    await alpha.init();
    await beta.init();
    try {
      const chatId = '15550000001@s.whatsapp.net';
      await alpha.getChatRepository().save({ id: chatId, conversationTimestamp: 1700000001 } as any);
      await alpha.getContactsRepository().save({ id: chatId, name: 'Only in alpha' } as any);
      await alpha.getMessagesRepository().upsert([
        {
          key: { id: 'alpha-msg-1', remoteJid: chatId, fromMe: false },
          messageTimestamp: 1700000001,
          message: { conversation: 'hi alpha' },
        } as any,
      ]);

      expect(await beta.getChatRepository().getById(chatId)).toBeNull();
      expect(await beta.getContactsRepository().getById(chatId)).toBeNull();
      expect(await beta.getMessagesRepository().getById('alpha-msg-1')).toBeNull();
      expect(
        await beta.getChatRepository().getAllWithMessages({ limit: 50, offset: 0 } as any, false),
      ).toEqual([]);

      // The same chat id in beta is a separate row, so neither overwrites the other.
      await beta.getContactsRepository().save({ id: chatId, name: 'Only in beta' } as any);
      expect((await alpha.getContactsRepository().getById(chatId))?.name).toBe('Only in alpha');
      expect((await beta.getContactsRepository().getById(chatId))?.name).toBe('Only in beta');
    } finally {
      await alpha.close();
      await beta.close();
    }
  });

  it('deleting a session drops only its own schema', async () => {
    process.env.WAHA_DATABASE_DRIVER = 'postgres';
    process.env.WAHA_DATABASE_URL = url;

    const gamma = new PostgresStorage(url, sessionSchemaName('gamma'));
    const delta = new PostgresStorage(url, sessionSchemaName('delta'));
    await gamma.init();
    await delta.init();
    await gamma.close();
    await delta.close();

    await new NowebStorageFactoryCore().deleteStorage(new LocalStoreCore(), 'gamma');

    const after = await schemas();
    expect(after).not.toContain('bunwa_gamma');
    expect(after).toContain('bunwa_delta');

    // A new session reusing the name starts empty.
    const reborn = new PostgresStorage(url, sessionSchemaName('gamma'));
    await reborn.init();
    try {
      expect(
        await reborn.getChatRepository().getAllWithMessages({ limit: 50, offset: 0 } as any, false),
      ).toEqual([]);
    } finally {
      await reborn.close();
    }
  });

  it('boot verification passes and leaves no store tables in public', async () => {
    process.env.WAHA_DATABASE_DRIVER = 'postgres';
    process.env.WAHA_DATABASE_URL = url;
    process.env.WAHA_STORAGE_DIR = mkdtempSync(join(tmpdir(), 'bunwa-isolation-storage-'));

    await verifyStorageAtBoot(new WhatsappConfigService());

    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      const result = await client.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
      );
      const tables = result.rows.map((row: { table_name: string }) => row.table_name);
      expect(tables).not.toContain('chats');
      expect(tables).not.toContain('messages');
    } finally {
      await client.end();
    }
  });
});

describe('SQLite store removal', () => {
  it('deleting a session removes its store file and leaves the rest of the session directory', async () => {
    const saved = process.env.WAHA_DATABASE_DRIVER;
    process.env.WAHA_DATABASE_DRIVER = 'sqlite';
    try {
      const store = new LocalStoreCore();
      const name = `sqlite-delete-${Date.now()}`;
      const dir = store.getSessionDirectory(name);
      mkdirSync(dir, { recursive: true });
      const file = store.getFilePath(name, 'store.sqlite3');
      writeFileSync(file, 'x');
      writeFileSync(`${file}-wal`, 'x');
      writeFileSync(join(dir, 'creds.json'), '{}');

      await new NowebStorageFactoryCore().deleteStorage(store, name);

      expect(existsSync(file)).toBe(false);
      expect(existsSync(`${file}-wal`)).toBe(false);
      expect(existsSync(join(dir, 'creds.json'))).toBe(true);
    } finally {
      if (saved === undefined) delete process.env.WAHA_DATABASE_DRIVER;
      else process.env.WAHA_DATABASE_DRIVER = saved;
    }
  });
});
