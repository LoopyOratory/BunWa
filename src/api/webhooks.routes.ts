import { Hono } from 'hono';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';

const MOCK_WEBHOOKS = new Map<string, any[]>();

export function createWebhooksRouter(): Hono {
  const router = new Hono();

  router.use('*', apiKeyAuthMiddleware());

  // GET /api/sessions/:session/webhooks
  router.get('/:session/webhooks',
    async (c) => {
      const session = c.req.param('session');
      const webhooks = MOCK_WEBHOOKS.get(session) || [];
      return c.json(webhooks);
    }
  );

  // POST /api/sessions/:session/webhooks
  router.post('/:session/webhooks',
    async (c) => {
      const session = c.req.param('session');
      const body = await c.req.json();
      const webhook = {
        id: `wh_${Date.now()}`,
        url: body.url,
        events: body.events || [],
        active: body.active !== undefined ? body.active : true,
        secret: body.secret || '',
        retryCount: body.retryCount || 3,
        lastTriggeredAt: null,
        createdAt: new Date().toISOString(),
      };
      const list = MOCK_WEBHOOKS.get(session) || [];
      list.push(webhook);
      MOCK_WEBHOOKS.set(session, list);
      return c.json(webhook, 201);
    }
  );

  // PUT /api/sessions/:session/webhooks/:id
  router.put('/:session/webhooks/:id',
    async (c) => {
      const session = c.req.param('session');
      const id = c.req.param('id');
      const body = await c.req.json();
      const list = MOCK_WEBHOOKS.get(session) || [];
      const idx = list.findIndex((w: any) => w.id === id);
      if (idx === -1) {
        return c.json({ error: 'Webhook not found' }, 404);
      }
      list[idx] = { ...list[idx], ...body, id };
      MOCK_WEBHOOKS.set(session, list);
      return c.json(list[idx]);
    }
  );

  // DELETE /api/sessions/:session/webhooks/:id
  router.delete('/:session/webhooks/:id',
    async (c) => {
      const session = c.req.param('session');
      const id = c.req.param('id');
      const list = MOCK_WEBHOOKS.get(session) || [];
      const filtered = list.filter((w: any) => w.id !== id);
      MOCK_WEBHOOKS.set(session, filtered);
      return c.json({ result: true });
    }
  );

  // POST /api/sessions/:session/webhooks/:id/test
  router.post('/:session/webhooks/:id/test',
    async (c) => {
      return c.json({ result: true, sentAt: new Date().toISOString() });
    }
  );

  return router;
}
