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
  failureReasons,
  parseDashboardRange,
  type DashboardSessionInput,
} from '../core/dashboard/dashboard-summary';
import type { AuditErrorKind } from '../core/audit/audit.service';
import { VERSION } from '../version';

const HOUR_MS = 60 * 60_000;
const ERROR_KINDS: readonly AuditErrorKind[] = ['send', 'refused', 'webhook', 'mcp', 'session', 'auth'];

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

  /**
   * `GET /api/dashboard/analytics?range=&session=`
   *
   * The analytics page: totals and time series (sent, failed, refused,
   * webhooks), per-session and per-feature breakdowns, failure reasons,
   * activity by hour of day, session stability, MCP and auth activity.
   */
  router.get('/dashboard/analytics', policiesMiddleware(CanServer(Action.Read)), async (c) => {
    const now = Date.now();
    const range = parseDashboardRange(c.req.query('range'));
    const session = c.req.query('session') || undefined;
    const spec = DASHBOARD_RANGES[range];
    const audit = container.resolve(AuditService);
    const manager = container.resolve(SessionManager);
    const window = { from: new Date(now - spec.ms), to: new Date(now), bucketMs: spec.bucketMs, session };
    const summary = audit.summarize(window);
    const analytics = audit.analytics(window);
    const sessions = (await manager.getSessions(true)).map((info) => ({
      name: info.name,
      status: String(info.status),
      engine: String((info.config as any)?.engine || VERSION.engine || 'NOWEB').toUpperCase(),
    }));

    return c.json({
      generatedAt: new Date(now).toISOString(),
      range: { key: range, from: window.from.toISOString(), to: window.to.toISOString(), bucketMs: spec.bucketMs },
      session: session ?? null,
      sessions,
      totals: summary.totals,
      perSession: Object.entries(summary.perSession)
        .filter(([name]) => name)
        .map(([name, counts]) => ({ session: name, ...counts }))
        .sort((a, b) => b.sent + b.failed - (a.sent + a.failed)),
      series: { ...summary.series, refused: analytics.refusedSeries },
      failureReasons: failureReasons(summary),
      webhooks: { failing: summary.webhookFailures },
      features: analytics.features,
      byHour: analytics.byHour,
      stability: analytics.stability,
      mcp: analytics.mcp,
      auth: analytics.auth,
    });
  });

  /**
   * `GET /api/dashboard/errors?range=&session=&kind=&q=&limit=&offset=`
   *
   * The error report: failed and refused sends, webhook and MCP failures,
   * session drops and failed API-key auth, newest first, with counts per kind.
   */
  router.get('/dashboard/errors', policiesMiddleware(CanServer(Action.Read)), async (c) => {
    const now = Date.now();
    const range = parseDashboardRange(c.req.query('range'));
    const spec = DASHBOARD_RANGES[range];
    const kindParam = c.req.query('kind');
    if (kindParam && !ERROR_KINDS.includes(kindParam as AuditErrorKind)) {
      return c.json({ statusCode: 400, message: `kind must be one of: ${ERROR_KINDS.join(', ')}` }, 400);
    }
    const toInt = (value: string | undefined) => (value === undefined ? undefined : Number.parseInt(value, 10) || 0);
    const result = container.resolve(AuditService).errors({
      from: new Date(now - spec.ms),
      to: new Date(now),
      session: c.req.query('session') || undefined,
      kind: (kindParam as AuditErrorKind) || undefined,
      search: c.req.query('q') || undefined,
      limit: toInt(c.req.query('limit')),
      offset: toInt(c.req.query('offset')),
    });
    return c.json(result);
  });

  return router;
}
