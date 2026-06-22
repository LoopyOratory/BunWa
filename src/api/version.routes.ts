import { Hono } from 'hono';
import { VERSION } from '../version';

export function createVersionRouter(): Hono {
  const router = new Hono();

  router.get('/', (c) => {
    return c.json(VERSION);
  });

  return router;
}
