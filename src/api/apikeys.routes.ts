import { Hono } from 'hono';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanServer, Action } from '../middleware/policies';

export function createApiKeysRouter(): Hono {
  const router = new Hono();

  router.use('*', apiKeyAuthMiddleware());

  router.get('/keys/',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      return c.json([]);
    }
  );

  router.post('/keys/',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const body = await c.req.json();
      return c.json({ id: 'key-id', key: body.key });
    }
  );

  router.put('/keys/:id',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const body = await c.req.json();
      return c.json({ id: c.req.param('id'), key: body.key });
    }
  );

  router.delete('/keys/:id',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      return c.json({ result: true });
    }
  );

  return router;
}
