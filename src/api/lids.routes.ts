import { Hono } from 'hono';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanSession, Action, FromParam } from '../middleware/policies';
import { workingSessionResolver } from '../middleware/session-resolver';

export function createLidsRouter(): Hono {
  const router = new Hono();

  router.use('*', apiKeyAuthMiddleware());

  router.get('/:session/lids/',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const limit = parseInt(c.req.query('limit') || '50');
      const offset = parseInt(c.req.query('offset') || '0');
      const lids = await (session as any).getAllLids({ limit, offset, sortBy: 'id', sortOrder: 'asc' });
      return c.json(lids);
    }
  );

  router.get('/:session/lids/count',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const count = await (session as any).getLidsCount();
      return c.json({ count });
    }
  );

  router.get('/:session/lids/:lid',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      let lid = c.req.param('lid');
      if (!lid.endsWith('@lid')) {
        lid = `${lid}@lid`;
      }
      const result = await (session as any).findPNByLid(lid);
      return c.json(result);
    }
  );

  router.get('/:session/lids/pn/:phoneNumber',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const phoneNumber = c.req.param('phoneNumber');
      const result = await (session as any).findLIDByPhoneNumber(phoneNumber);
      return c.json(result);
    }
  );

  return router;
}
