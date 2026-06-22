import { Hono } from 'hono';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanSession, Action, FromParam } from '../middleware/policies';
import { workingSessionResolver } from '../middleware/session-resolver';

export function createContactsSessionRouter(): Hono {
  const router = new Hono();

  router.use('*', apiKeyAuthMiddleware());

  router.get('/:session/contacts/:id',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      return c.json({ id: c.req.param('id') });
    }
  );

  router.put('/:session/contacts/:chatId',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const body = await c.req.json();
      return c.json({ result: true });
    }
  );

  return router;
}
