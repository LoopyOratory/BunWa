import { Hono } from 'hono';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanSession, Action, FromParam } from '../middleware/policies';
import { workingSessionResolver } from '../middleware/session-resolver';

const MOCK_TEMPLATES = new Map<string, any[]>();

export function createTemplatesRouter(): Hono {
  const router = new Hono();

  router.use('*', apiKeyAuthMiddleware());

  // GET /api/sessions/:session/templates
  router.get('/:session/templates',
    async (c) => {
      const session = c.req.param('session');
      const templates = MOCK_TEMPLATES.get(session) || [];
      return c.json(templates);
    }
  );

  // POST /api/sessions/:session/templates
  router.post('/:session/templates',
    async (c) => {
      const session = c.req.param('session');
      const body = await c.req.json();
      const now = new Date().toISOString();
      const template = {
        id: `tmpl_${Date.now()}`,
        sessionId: session,
        name: body.name,
        body: body.body,
        header: body.header || '',
        footer: body.footer || '',
        createdAt: now,
        updatedAt: now,
      };
      const list = MOCK_TEMPLATES.get(session) || [];
      list.push(template);
      MOCK_TEMPLATES.set(session, list);
      return c.json(template, 201);
    }
  );

  // DELETE /api/sessions/:session/templates/:id
  router.delete('/:session/templates/:id',
    async (c) => {
      const session = c.req.param('session');
      const id = c.req.param('id');
      const list = MOCK_TEMPLATES.get(session) || [];
      const filtered = list.filter((t: any) => t.id !== id);
      MOCK_TEMPLATES.set(session, filtered);
      return c.json({ result: true });
    }
  );

  return router;
}
