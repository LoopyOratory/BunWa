import { describe, expect, test } from 'bun:test';
import { RedisCache } from '../core/cache/redis-cache';

describe('Redis cache', () => {
  test('is a no-op when no URL is configured', async () => {
    const cache = new RedisCache('');
    expect(cache.enabled).toBe(false);
    expect(await cache.ping()).toBe(false);
    expect(await cache.getJson('missing')).toBeNull();
    expect(await cache.wrap('key', 10, async () => 42)).toBe(42);
    cache.close();
  });

  test('fails fast and falls back to the loader when Redis is unreachable', async () => {
    const cache = new RedisCache('redis://127.0.0.1:6399');
    const started = performance.now();
    expect(await cache.ping()).toBe(false);
    expect(await cache.getJson('missing')).toBeNull();
    expect(await cache.wrap('key', 10, async () => 'db-value')).toBe('db-value');
    // A dead cache must never stall the request path.
    expect(performance.now() - started).toBeLessThan(3000);
    cache.close();
  });
});
