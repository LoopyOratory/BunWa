import { Hono } from 'hono';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanSession, Action, FromParam } from '../middleware/policies';
import { SessionManager } from '../core/manager.core';
import { NotFoundException } from '../core/exceptions';
import {
  SendingPolicyService,
  parseOverrides,
} from '../core/sending-policy/sending-policy.service';

/**
 * Sending policy REST surface:
 *   GET /api/sessions/:session/policy        — effective config + usage counters
 *   PUT /api/sessions/:session/policy        — set per-session overrides
 *   GET /api/sessions/:session/policy/usage  — counters and next-allowed times
 *
 * Policy is configurable for known-but-stopped sessions too (only existence
 * is required, a running session is not).
 */
export function createSendingPolicyRouter(): Hono {
  const router = new Hono();

  router.use('*', apiKeyAuthMiddleware());

  const requireSession = async (name: string): Promise<void> => {
    const exists = await container.resolve(SessionManager).exists(name);
    if (!exists) {
      throw new NotFoundException(`Session ${name} not found`);
    }
  };

  router.get('/:session/policy',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    async (c) => {
      const sessionName = c.req.param('session');
      try {
        await requireSession(sessionName);
      } catch (error: any) {
        if (error instanceof NotFoundException) {
          return c.json({ statusCode: 404, message: error.message }, 404);
        }
        throw error;
      }
      const policy = container.resolve(SendingPolicyService);
      return c.json({
        session: sessionName,
        bypassed: policy.isBypassed(sessionName),
        overrides: policy.getOverrides(sessionName),
        usage: policy.getUsage(sessionName),
      });
    }
  );

  router.put('/:session/policy',
    policiesMiddleware(CanSession(Action.Setting, FromParam('session'))),
    async (c) => {
      const sessionName = c.req.param('session');
      try {
        await requireSession(sessionName);
      } catch (error: any) {
        if (error instanceof NotFoundException) {
          return c.json({ statusCode: 404, message: error.message }, 404);
        }
        throw error;
      }
      const body = await c.req.json().catch(() => null);
      const overrides = parseOverrides(body);
      const policy = container.resolve(SendingPolicyService);
      policy.setOverrides(sessionName, overrides);
      return c.json({
        session: sessionName,
        overrides: policy.getOverrides(sessionName),
        usage: policy.getUsage(sessionName),
      });
    }
  );

  router.get('/:session/policy/usage',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    async (c) => {
      const sessionName = c.req.param('session');
      try {
        await requireSession(sessionName);
      } catch (error: any) {
        if (error instanceof NotFoundException) {
          return c.json({ statusCode: 404, message: error.message }, 404);
        }
        throw error;
      }
      const policy = container.resolve(SendingPolicyService);
      return c.json({
        session: sessionName,
        bypassed: policy.isBypassed(sessionName),
        ...policy.getUsage(sessionName),
      });
    }
  );

  return router;
}
