import { Hono } from 'hono';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanSession, Action, FromParam } from '../middleware/policies';
import { workingSessionResolver } from '../middleware/session-resolver';

export function createProfileRouter(): Hono<{ Variables: { session: any; body: any } }> {
  const router = new Hono<{ Variables: { session: any; body: any } }>();

  router.use('*', apiKeyAuthMiddleware());

  router.get('/:session/profile',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const me = (session as any).getSessionMeInfo();
      return c.json(me || { id: '', pushName: '' });
    }
  );

  router.put('/:session/profile/name',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const body = await c.req.json();
      await (session as any).setProfileName(body.name);
      return c.json({ result: true });
    }
  );

  router.put('/:session/profile/status',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const body = await c.req.json();
      await (session as any).setProfileStatus(body.status);
      return c.json({ result: true });
    }
  );

  router.put('/:session/profile/picture',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const file = await c.req.json();
      const result = await (session as any).setProfilePicture(file);
      return c.json({ result });
    }
  );

  router.delete('/:session/profile/picture',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const result = await (session as any).deleteProfilePicture();
      return c.json({ result });
    }
  );

  return router;
}
