import { Hono } from 'hono';

export function createHealthRouter(): Hono {
  const router = new Hono();

  router.get('/', (c) => {
    return c.json({ status: 'ok' });
  });

  return router;
}
