import { Hono } from 'hono';

export function createPingRouter(): Hono {
  const router = new Hono();

  router.get('/', (c) => {
    return c.json({ message: 'pong' });
  });

  return router;
}
