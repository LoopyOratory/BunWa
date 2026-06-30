import { Hono } from 'hono';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { TemplateService } from '../core/templates/template.service';

export function createTemplatesRouter(): Hono {
  const router = new Hono();

  router.use('*', apiKeyAuthMiddleware());

  // GET /api/sessions/:session/templates
  router.get('/:session/templates', async (c) => {
    const session = c.req.param('session');
    const svc = container.resolve(TemplateService);
    const templates = await svc.findBySession(session);
    return c.json(templates);
  });

  // POST /api/sessions/:session/templates
  router.post('/:session/templates', async (c) => {
    const session = c.req.param('session');
    const body = await c.req.json();
    const svc = container.resolve(TemplateService);
    try {
      const template = await svc.create(session, { name: body.name, body: body.body, header: body.header, footer: body.footer });
      return c.json(template, 201);
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  });

  // DELETE /api/sessions/:session/templates/:id
  router.delete('/:session/templates/:id', async (c) => {
    const session = c.req.param('session');
    const id = c.req.param('id');
    const svc = container.resolve(TemplateService);
    try {
      await svc.delete(session, id);
      return c.json({ result: true });
    } catch (err: any) {
      return c.json({ error: err.message }, 404);
    }
  });

  return router;
}
