/**
 * Small Redis cache layer.
 *
 * Bun ships a Redis client, so this adds no dependency. When no Redis URL is
 * configured the cache is a no-op and every caller falls back to the database.
 * Redis is a cache, never the source of truth.
 */
export class RedisCache {
  private readonly client: Bun.RedisClient | null;

  constructor(url = process.env.BUNWA_REDIS_URL || process.env.REDIS_URL) {
    this.client = url
      ? new Bun.RedisClient(url, {
          // Redis is an optional cache: fail fast instead of letting a dead
          // server stall every request that tries to read or write a cache key.
          connectionTimeout: 2000,
          autoReconnect: false,
          enableOfflineQueue: false,
        })
      : null;
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  async ping(): Promise<boolean> {
    if (!this.client) return false;
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    if (!this.client) return null;
    try {
      const value = await this.client.get(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds = 60): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.setex(key, ttlSeconds, JSON.stringify(value));
    } catch {
      // A cache miss is always safe.
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.del(key);
    } catch {
      // Ignore cache invalidation failures.
    }
  }

  async wrap<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
    const cached = await this.getJson<T>(key);
    if (cached !== null) return cached;
    const value = await load();
    await this.setJson(key, value, ttlSeconds);
    return value;
  }

  close(): void {
    this.client?.close();
  }
}

export const cache = new RedisCache();
