import { Hono } from 'hono';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanSession, Action, FromParam } from '../middleware/policies';
import { workingSessionResolver } from '../middleware/session-resolver';
import { AuditService, AuditAction } from '../core/audit/audit.service';
import { sendFailureMetadata } from '../core/audit/failure-reason';

export function createEventsRouter(): Hono<{ Variables: { session: any } }> {
  const router = new Hono<{ Variables: { session: any } }>();

  router.use('*', apiKeyAuthMiddleware());

  router.post('/:session/events',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const body = await c.req.json().catch(() => null);
      const event = body?.event;
      if (!body?.chatId || typeof event?.name !== 'string' || !event.name.trim()) {
        return c.json({ statusCode: 400, message: 'chatId and event.name are required' }, 400);
      }
      if (typeof event.startTime !== 'number' || !Number.isFinite(event.startTime)) {
        return c.json({ statusCode: 400, message: 'event.startTime must be a Unix time in seconds' }, 400);
      }
      if (event.endTime !== undefined && (typeof event.endTime !== 'number' || event.endTime < event.startTime)) {
        return c.json({ statusCode: 400, message: 'event.endTime must be a Unix time in seconds after startTime' }, 400);
      }
      const sessionName = c.req.param('session');
      try {
        const result = await (session as any).sendEvent({
          session: sessionName,
          chatId: body.chatId,
          reply_to: body.reply_to,
          event,
        });
        container.resolve(AuditService).logInfo(AuditAction.MESSAGE_SENT, {
          sessionName,
          metadata: { action: 'sendEvent' },
        });
        return c.json(result);
      } catch (error: any) {
        container.resolve(AuditService).logWarn(AuditAction.MESSAGE_FAILED, {
          sessionName,
          errorMessage: error?.message || String(error),
          metadata: { action: 'sendEvent', ...sendFailureMetadata(error) },
        });
        throw error;
      }
    }
  );

  return router;
}
