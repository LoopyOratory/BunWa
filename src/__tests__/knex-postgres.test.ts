import { describe, expect, test } from 'bun:test';
import { BunPgClient, makePostgresKnex } from '../core/db/knex-postgres';

/**
 * Guards the bun isolated-linker driver fix: knex loads its pg driver with a
 * bare require evaluated inside knex's own (cache-resolved) module directory,
 * where the isolated layout puts no pg. The subclass must return the
 * app-imported pg module instead.
 */
describe('knex postgres factory (isolated-linker driver fix)', () => {
  test('client subclass resolves the app-imported pg driver', async () => {
    const client: any = new (BunPgClient as any)({
      connection: 'postgres://user:pass@localhost:5432/db',
    });
    try {
      const driver = client._driver();
      // pg module surface
      expect(typeof driver.Pool).toBe('function');
      expect(typeof driver.Client).toBe('function');
      expect(typeof driver.types).toBe('object');
    } finally {
      await client.destroy();
    }
  });

  test('factory wires the subclass into the knex instance', async () => {
    const db = makePostgresKnex('postgres://user:pass@localhost:5432/db');
    try {
      expect(db.client).toBeInstanceOf(BunPgClient);
    } finally {
      await db.destroy();
    }
  });
});
