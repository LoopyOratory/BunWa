import { MiddlewareHandler } from 'hono';
import { container } from 'tsyringe';
import { WhatsappConfigService } from '../config.service';
import { DashboardConfigServiceCore } from '../core/config/DashboardConfigServiceCore';
import { AuditService, AuditAction } from '../core/audit/audit.service';
import { SessionManager } from '../core/manager.core';
import { isRestApiKey, resolveRestApiKey } from '../core/api-keys/rest-api-keys';
import { timingSafeEqual } from 'crypto';

/** Best-effort client IP for audit logging (not spoof-proof; informational only). */
function getClientIp(c: any): string | undefined {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    || c.req.header('x-real-ip')
    || undefined;
}

export class User {
  isAdmin: boolean = false;
  session?: string;
  actions?: Record<string, boolean> | null;
  keyId?: string;
  keyName?: string;
}

/**
 * Timing-safe string comparison to prevent timing attacks.
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Whether to allow requests without any authentication when no API key is configured.
 * Defaults to true for dev convenience; set WAHA_ALLOW_NO_AUTH=false to disable.
 */
function allowNoAuth(): boolean {
  return process.env.WAHA_ALLOW_NO_AUTH !== 'false';
}

/**
 * Auth middleware. Credentials are resolved in this order:
 *
 * 1. the master `WAHA_API_KEY` (via x-api-key) — full admin
 * 2. dashboard Basic credentials — full admin
 * 3. a per-session REST key (`sk_ses_...`) — scoped to one session and to the
 *    actions in its allowlist; never satisfies `CanServer`
 *
 * MCP keys (`sk_mcp_...`) are not accepted here: they only resolve against the
 * MCP endpoint's own hash storage.
 */
export function apiKeyAuthMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const config = container.resolve(WhatsappConfigService);

    const excludedPaths = config.getExcludedFullPaths();
    const path = new URL(c.req.url).pathname;

    if (excludedPaths.includes(path)) {
      return next();
    }

    const audit = container.resolve(AuditService);
    const logAuthFailure = () => audit.logWarn(AuditAction.API_KEY_AUTH_FAILED, {
      ipAddress: getClientIp(c),
      method: c.req.method,
      path,
    });

    const apiKey = config.getApiKey();
    const providedKey = c.req.header('x-api-key');

    // 1. Master API key — full admin
    if (apiKey && providedKey && safeCompare(providedKey, apiKey)) {
      c.set('user', { isAdmin: true } as User);
      return next();
    }

    // 2. Dashboard Basic credentials — full admin
    const authHeader = c.req.header('authorization');
    const hasBasic = !!authHeader?.startsWith('Basic ');
    let basicValid = false;
    if (hasBasic) {
      try {
        const dashboardConfig = container.resolve(DashboardConfigServiceCore);
        const credentials = dashboardConfig.credentials;
        if (credentials) {
          const base64 = authHeader!.split(' ')[1];
          const decoded = atob(base64);
          const [user, pass] = decoded.split(':');
          if (safeCompare(user, credentials[0]) && safeCompare(pass, credentials[1])) {
            basicValid = true;
          }
        }
      } catch {
        // Invalid basic auth format
      }
      if (basicValid) {
        c.set('user', { isAdmin: true } as User);
        return next();
      }
    }

    // 3. Per-session REST API key — scoped to one session and its actions
    if (providedKey) {
      const manager = container.resolve(SessionManager);
      const resolved = await resolveRestApiKey(manager, providedKey);
      if (resolved) {
        c.set('user', {
          isAdmin: false,
          session: resolved.session,
          actions: Object.fromEntries(resolved.record.actions.map((action) => [action, true])),
          keyId: resolved.record.id,
          keyName: resolved.record.name,
        } as User);
        audit.logInfo(AuditAction.API_KEY_USED, {
          apiKeyId: resolved.record.id,
          apiKeyName: resolved.record.name,
          sessionName: resolved.session,
          ipAddress: getClientIp(c),
          method: c.req.method,
          path,
        });
        // Fire-and-forget: auth must not wait on the sessions index write.
        manager.touchRestApiKey(resolved.session, resolved.record.id).catch(() => {});
        return next();
      }

      // A key that looks like a session key but does not resolve is always
      // rejected, even in keyless dev mode, so a revoked key can never fall
      // through to the no-auth allowance.
      const rejectKey = isRestApiKey(providedKey) || !!apiKey || hasBasic;
      if (rejectKey) {
        logAuthFailure();
        return c.json(
          { statusCode: 401, message: hasBasic && !basicValid ? 'Invalid credentials' : 'Invalid API key' },
          401,
        );
      }
    }

    if (hasBasic) {
      logAuthFailure();
      return c.json({ statusCode: 401, message: 'Invalid credentials' }, 401);
    }

    // No API key configured and no auth provided — allow (dev mode) only if WAHA_ALLOW_NO_AUTH is not false
    if (!apiKey) {
      if (allowNoAuth()) {
        c.set('user', { isAdmin: true } as User);
        return next();
      }
      // fail-closed: WAHA_ALLOW_NO_AUTH=false, reject unauthenticated requests
      return c.json({ statusCode: 401, message: 'WAHA_ALLOW_NO_AUTH=false and no API key configured' }, 401);
    }

    return c.json({ statusCode: 401, message: 'Authentication required' }, 401);
  };
}
