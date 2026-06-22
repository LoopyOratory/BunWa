import { Hono } from 'hono';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanSession, Action, FromParam } from '../middleware/policies';
import { workingSessionResolver } from '../middleware/session-resolver';

export function createEventsRouter(): Hono {
  const router = new Hono();

  router.use('*', apiKeyAuthMiddleware());

  router.post('/:session/events',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const body = await c.req.json();
      return c.json({ id: 'message-id', timestamp: Date.now() });
    }
  );

  return router;
}
