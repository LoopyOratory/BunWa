import { MiddlewareHandler } from 'hono';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  /** Time window in milliseconds (default: 60000 = 1 minute) */
  windowMs?: number;
  /** Max requests per window (default: 100) */
  max?: number;
  /** Key function to identify clients (default: IP-based) */
  keyFn?: (c: any) => string;
  /** Message returned when rate limited */
  message?: string;
}

/**
 * Simple in-memory rate limiter middleware for Hono.
 * Uses a sliding window counter per key (typically client IP).
 */
export function rateLimit(options: RateLimitOptions = {}): MiddlewareHandler {
  const windowMs = options.windowMs ?? 60_000;
  const max = options.max ?? 100;
  const keyFn = options.keyFn ?? ((c: any) => {
    return c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
      || c.req.header('x-real-ip')
      || 'unknown';
  });
  const message = options.message || 'Too many requests, please try again later';

  const store = new Map<string, RateLimitEntry>();

  // Periodic cleanup every 5 minutes to prevent memory leaks
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) {
        store.delete(key);
      }
    }
  }, 5 * 60_000);

  // Allow the process to exit even if the timer is active
  if (typeof cleanupInterval === 'object' && 'unref' in cleanupInterval) {
    cleanupInterval.unref();
  }

  return async (c, next) => {
    const key = keyFn(c);
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      // New window
      store.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (entry.count >= max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      c.header('Retry-After', String(retryAfter));
      c.header('X-RateLimit-Limit', String(max));
      c.header('X-RateLimit-Remaining', '0');
      c.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));
      return c.json({ statusCode: 429, message }, 429);
    }

    entry.count++;
    c.header('X-RateLimit-Limit', String(max));
    c.header('X-RateLimit-Remaining', String(max - entry.count));
    c.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));
    return next();
  };
}
