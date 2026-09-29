import { Hono } from 'hono';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanSession, Action, FromParam } from '../middleware/policies';
import { SessionManager } from '../core/manager.core';
import { BadRequestException, NotFoundException } from '../core/exceptions';
import {
  SendingPolicyService,
  SendingPolicyConfig,
  parseQuietHours,
} from '../core/sending-policy/sending-policy.service';

const OVERRIDE_FIELDS = [
  'maxPerMinute',
  'maxPerHour',
  'maxPerDay',
  'newChatsPerDay',
  'reachoutMinIntervalSeconds',
  'warmupDays',
  'warmupFloorPercent',
  'quietHours',
  'enabled',
] as const;

const NUMBER_FIELDS: ReadonlySet<string> = new Set([
  'maxPerMinute',
  'maxPerHour',
  'maxPerDay',
  'newChatsPerDay',
  'reachoutMinIntervalSeconds',
  'warmupDays',
  'warmupFloorPercent',
]);

/**
 * Validate and normalize a per-session policy override body. Throws
 * BadRequestException on unknown or malformed fields.
 */
export function parseOverrides(body: any): SendingPolicyConfig {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequestException('Body must be a JSON object with policy overrides');
  }
  const overrides: SendingPolicyConfig = {};
  for (const [key, value] of Object.entries(body)) {
    if (!OVERRIDE_FIELDS.includes(key as any)) {
      throw new BadRequestException(`Unknown policy field '${key}'`);
    }
    if (value === null) {
      continue;
    }
    if (NUMBER_FIELDS.has(key)) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new BadRequestException(`Field '${key}' must be a non-negative number`);
      }
      (overrides as any)[key] = value;
      continue;
    }
    if (key === 'quietHours') {
      if (typeof value !== 'string') {
        throw new BadRequestException("Field 'quietHours' must be a 'HH:MM-HH:MM' string or ''");
      }
      const trimmed = value.trim();
      if (trimmed && !parseQuietHours(trimmed)) {
        throw new BadRequestException(
          "Field 'quietHours' must be a 'HH:MM-HH:MM' string or ''",
        );
      }
      overrides.quietHours = trimmed;
      continue;
    }
    if (key === 'enabled') {
      if (typeof value !== 'boolean') {
        throw new BadRequestException("Field 'enabled' must be a boolean");
      }
      overrides.enabled = value;
      continue;
    }
  }
  return overrides;
}

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
