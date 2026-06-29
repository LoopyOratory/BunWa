/**
 * Per-key sliding window rate limiter for MCP tool calls.
 * In-memory per-process; move to Redis for multi-instance deployments.
 * No NestJS dependencies — throws plain Error with status info.
 */

const DEFAULT_MAX = 60;
const DEFAULT_WINDOW_MS = 60_000;

export class RateLimitError extends Error {
  status = 429;
  constructor(message = 'MCP rate limit exceeded') {
    super(message);
    this.name = 'RateLimitError';
  }
}

/**
 * Read MCP rate-limit configuration from the environment.
 * Falls back to the default for any missing, blank, non-positive, or non-numeric value.
 */
export function readRateLimitConfig(env: Record<string, string | undefined> = process.env): {
  max: number;
  windowMs: number;
} {
  const parsePositiveInt = (raw: string | undefined, fallback: number): number => {
    if (!raw || raw.trim() === '') return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    const i = Math.floor(n);
    return i >= 1 ? i : fallback;
  };

  return {
    max: parsePositiveInt(env['MCP_RATE_LIMIT_MAX'], DEFAULT_MAX),
    windowMs: parsePositiveInt(env['MCP_RATE_LIMIT_WINDOW_MS'], DEFAULT_WINDOW_MS),
  };
}

export class KeyRateLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(
    private readonly max = 60,
    private readonly windowMs = 60_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  check(key: string): void {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter(ts => t - ts < this.windowMs);
    if (recent.length === 0) {
      this.hits.delete(key);
    }
    if (recent.length >= this.max) {
      throw new RateLimitError();
    }
    recent.push(t);
    this.hits.set(key, recent);
  }
}
