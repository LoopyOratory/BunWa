import { Hono } from 'hono';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanSession, Action, FromParam } from '../middleware/policies';
import { workingSessionResolver } from '../middleware/session-resolver';

export function createPresenceRouter(): Hono {
  const router = new Hono();

  router.use('*', apiKeyAuthMiddleware());

  router.get('/:session/presence',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const presences = await (session as any).getPresences();
      return c.json(presences);
    }
  );

  router.post('/:session/presence',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const body = await c.req.json();
      await (session as any).setPresence(body.presence, body.chatId);
      return c.json({ result: true });
    }
  );

  router.get('/:session/presence/:chatId',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const chatId = c.req.param('chatId');
      const presence = await (session as any).getPresence(chatId);
      return c.json(presence);
    }
  );

  router.post('/:session/presence/:chatId/subscribe',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const chatId = c.req.param('chatId');
      await (session as any).subscribePresence(chatId);
      return c.json({ result: true });
    }
  );

  return router;
}
