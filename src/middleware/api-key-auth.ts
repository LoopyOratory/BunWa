import { MiddlewareHandler } from 'hono';
import { container } from 'tsyringe';
import { WhatsappConfigService } from '../config.service';
import { DashboardConfigServiceCore } from '../core/config/DashboardConfigServiceCore';
import { timingSafeEqual } from 'crypto';

export class User {
  isAdmin: boolean = false;
  session?: string;
  actions?: Record<string, boolean> | null;
}

/**
 * Timing-safe string comparison to prevent timing attacks.
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Auth middleware that accepts:
 * 1. API key via x-api-key header
 * 2. Basic auth via Authorization header (dashboard credentials)
 *
 * Both grant admin access when valid.
 */
export function apiKeyAuthMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const config = container.resolve(WhatsappConfigService);

    const excludedPaths = config.getExcludedFullPaths();
    const path = new URL(c.req.url).pathname;

    if (excludedPaths.includes(path)) {
      return next();
    }

    // Check for API key auth
    const apiKey = config.getApiKey();
    const providedKey = c.req.header('x-api-key');
    if (apiKey && providedKey) {
      if (safeCompare(providedKey, apiKey)) {
        c.set('user', { isAdmin: true } as User);
        return next();
      }
      return c.json({ statusCode: 401, message: 'Invalid API key' }, 401);
    }

    // Check for Basic auth (dashboard credentials)
    const authHeader = c.req.header('authorization');
    if (authHeader?.startsWith('Basic ')) {
      try {
        const dashboardConfig = container.resolve(DashboardConfigServiceCore);
        const credentials = dashboardConfig.credentials;
        if (credentials) {
          const base64 = authHeader.split(' ')[1];
          const decoded = atob(base64);
          const [user, pass] = decoded.split(':');
          if (safeCompare(user, credentials[0]) && safeCompare(pass, credentials[1])) {
            c.set('user', { isAdmin: true } as User);
            return next();
          }
        }
      } catch {
        // Invalid basic auth format
      }
      return c.json({ statusCode: 401, message: 'Invalid credentials' }, 401);
    }

    // No API key configured and no auth provided — allow (dev mode)
    if (!apiKey) {
      c.set('user', { isAdmin: true } as User);
      return next();
    }

    return c.json({ statusCode: 401, message: 'Authentication required' }, 401);
  };
}
