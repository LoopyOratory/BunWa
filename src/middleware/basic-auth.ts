import { MiddlewareHandler } from 'hono';
import { timingSafeEqual } from 'crypto';

/**
 * Timing-safe string comparison to prevent timing attacks.
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function basicAuthMiddleware(username: string, password: string, excludePaths: string[] = []): MiddlewareHandler {
  return async (c, next) => {
    const path = new URL(c.req.url).pathname;

    if (excludePaths.some(p => path.startsWith(p))) {
      return next();
    }

    const authHeader = c.req.header('authorization');
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      c.header('WWW-Authenticate', 'Basic realm="WAHA Dashboard"');
      return c.json({ statusCode: 401, message: 'Unauthorized' }, 401);
    }

    const base64Credentials = authHeader.split(' ')[1];
    const credentials = atob(base64Credentials).split(':');
    const [providedUser, providedPass] = credentials;

    if (!safeCompare(providedUser, username) || !safeCompare(providedPass, password)) {
      return c.json({ statusCode: 401, message: 'Invalid credentials' }, 401);
    }

    return next();
  };
}
