import { Hono } from 'hono';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanServer, Action } from '../middleware/policies';
import { AuditService } from '../core/audit/audit.service';
import { SessionManager } from '../core/manager.core';
import { SendingPolicyService } from '../core/sending-policy/sending-policy.service';
import { WhatsappConfigService } from '../config.service';
import { checkStoreHealth } from '../core/storage/store-health';
import {
  buildDashboardSummary,
  DASHBOARD_RANGES,
  parseDashboardRange,
  type DashboardSessionInput,
} from '../core/dashboard/dashboard-summary';
import { VERSION } from '../version';

const HOUR_MS = 60 * 60_000;

/**
 * `GET /api/dashboard/summary?range=1h|24h|7d|30d&session=<name>`
 *
 * Everything the ops dashboard shows, in one call: session health and
 * limits, send and webhook outcomes counted in SQL over the whole range, and
 * the attention list. Admin only, since it spans every session.
 */
export function createDashboardRouter(): Hono {
  const router = new Hono();
  router.use('*', apiKeyAuthMiddleware());

  router.get('/dashboard/summary', policiesMiddleware(CanServer(Action.Read)), async (c) => {
    const now = Date.now();
    const range = parseDashboardRange(c.req.query('range'));
    const sessionFilter = c.req.query('session') || undefined;
    const spec = DASHBOARD_RANGES[range];

    const manager = container.resolve(SessionManager);
    const config = container.resolve(WhatsappConfigService);
    const audit = container.resolve(AuditService);
    const policy = container.isRegistered(SendingPolicyService)
      ? container.resolve(SendingPolicyService)
      : null;

    const defaultEngine = String(VERSION.engine || 'NOWEB').toUpperCase();
    const listed = await manager.getSessions(true);
    const sessions: DashboardSessionInput[] = listed
      .filter((info) => !sessionFilter || info.name === sessionFilter)
      .map((info) => {
        const live = manager.isRunning(info.name) ? (manager.getSession(info.name) as any) : null;
        const sessionConfig: any = info.config ?? {};
        let usage = null;
        let bypassed = false;
        if (policy) {
          try {
            bypassed = policy.isBypassed(info.name);
            usage = policy.getUsage(info.name);
          } catch {
            usage = null;
          }
        }
        return {
          name: info.name,
          engine: String(sessionConfig.engine || defaultEngine).toUpperCase(),
          status: String(info.status),
          statusSince: manager.getStatusSince(info.name),
          lastActivityAt: info.timestamps?.activity ?? null,
          account: live?.getSessionMeInfo?.() ?? null,
          autoStart: sessionConfig.autoStart === true,
          usage,
          bypassed,
        };
      });

    const summary = buildDashboardSummary({
      now,
      range,
      server: {
        version: VERSION.version,
        tier: String(VERSION.tier),
        engine: String(VERSION.engine),
        uptimeSeconds: Math.round(process.uptime()),
        store: await checkStoreHealth(config),
      },
      sessions,
      audit: audit.summarize({
        from: new Date(now - spec.ms),
        to: new Date(now),
        bucketMs: spec.bucketMs,
        session: sessionFilter,
      }),
      recent: audit.summarize({
        from: new Date(now - HOUR_MS),
        to: new Date(now),
        bucketMs: HOUR_MS,
        session: sessionFilter,
      }),
    });
    return c.json(summary);
  });

  return router;
}
