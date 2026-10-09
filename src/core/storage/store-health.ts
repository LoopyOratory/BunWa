import type { WhatsappConfigService } from '../../config.service';
import { makePostgresKnex } from '../db/knex-postgres';

export interface StoreHealth {
  driver: 'sqlite' | 'postgres';
  ok: boolean;
  error?: string;
  checkedAt: string;
}

const CACHE_MS = 30_000;
const TIMEOUT_MS = 3_000;
let cached: { at: number; value: StoreHealth } | null = null;

/**
 * Whether the message store's database answers, for the dashboard's system
 * strip. SQLite is local and always reported healthy; Postgres gets a
 * `SELECT 1` bounded at 3 s. The answer is cached for 30 s so a dashboard
 * polling every few seconds does not open a connection each time.
 */
export async function checkStoreHealth(config: WhatsappConfigService): Promise<StoreHealth> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) {
    return cached.value;
  }
  const driver = config.getDatabaseDriver() === 'postgres' ? 'postgres' : 'sqlite';
  let value: StoreHealth = { driver, ok: true, checkedAt: new Date(now).toISOString() };

  if (driver === 'postgres') {
    const url = config.getSessionPostgresUrl();
    if (!url) {
      value = { ...value, ok: false, error: 'No Postgres connection URL is configured' };
    } else {
      const knex = makePostgresKnex(url);
      try {
        await Promise.race([
          knex.raw('SELECT 1'),
          Bun.sleep(TIMEOUT_MS).then(() => {
            throw new Error(`no answer within ${TIMEOUT_MS / 1000} s`);
          }),
        ]);
      } catch (error: any) {
        value = { ...value, ok: false, error: error?.message || String(error) };
      } finally {
        knex.destroy().catch(() => {});
      }
    }
  }

  cached = { at: now, value };
  return value;
}

/** Test hook: forget the cached answer. */
export function resetStoreHealthCache(): void {
  cached = null;
}
