/**
 * A small TTL cache on a plain Map — the surface BunWa used from node-cache
 * (constructor options included). Replaces the node-cache dependency with
 * Bun-native code.
 *
 * Entries expire lazily on read, and an optional interval prunes expired
 * entries so an idle cache cannot grow unbounded (node-cache's `checkperiod`).
 * Values are stored by reference, matching the `useClones: false` mode every
 * BunWa call site used. Satisfies Baileys' `CacheStore` duck type
 * (get/set/del/flushAll/close).
 */
export class TtlCache<V = unknown> {
  private readonly store = new Map<string, { value: V; expiresAt: number }>();
  private readonly ttlMs: number;
  private sweeper: ReturnType<typeof setInterval> | null = null;

  constructor(options: { stdTtl?: number; useClones?: boolean; checkperiod?: number } = {}) {
    this.ttlMs = (options.stdTtl ?? 0) * 1000;
    if (options.checkperiod && options.checkperiod > 0) {
      this.sweeper = setInterval(() => this.prune(), options.checkperiod * 1000);
      // A timer alone must never keep the process alive.
      this.sweeper.unref?.();
    }
  }

  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V, ttlSeconds?: number): void {
    const ttlMs = ttlSeconds !== undefined ? ttlSeconds * 1000 : this.ttlMs;
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  /** Live, unexpired keys (node-cache's `keys()`). */
  keys(): string[] {
    this.prune();
    return [...this.store.keys()];
  }

  del(key: string): void {
    this.store.delete(key);
  }

  flushAll(): void {
    this.store.clear();
  }

  /** Remove already-expired entries (the sweeper calls this periodically). */
  private prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt <= now) this.store.delete(key);
    }
  }

  close(): void {
    if (this.sweeper) {
      clearInterval(this.sweeper);
      this.sweeper = null;
    }
    this.store.clear();
  }
}
