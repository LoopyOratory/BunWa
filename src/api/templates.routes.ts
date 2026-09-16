import { Hono } from 'hono';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { TemplateService, type Template } from '../core/templates/template.service';
import { workingSessionResolver } from '../middleware/session-resolver';

export function createTemplatesRouter(): Hono<{ Variables: { session: unknown } }> {
  // The send route resolves the running session onto the context.
  const router = new Hono<{ Variables: { session: unknown } }>();

  router.use('*', apiKeyAuthMiddleware());

  // GET /api/sessions/:session/templates
  // Each template carries the variables it needs, so a UI can render inputs
  // without calling preview first.
  router.get('/:session/templates', async (c) => {
    const session = c.req.param('session');
    const svc = container.resolve(TemplateService);
    const templates = await svc.findBySession(session);
    return c.json(templates.map((template) => withVariables(svc, template)));
  });

  // GET /api/sessions/:session/templates/:id
  // A single template, addressed by id or by name, with its variables.
  router.get('/:session/templates/:id', async (c) => {
    const session = c.req.param('session');
    const id = c.req.param('id');
    const svc = container.resolve(TemplateService);
    try {
      const template = await resolveTemplate(svc, session, id);
      return c.json(withVariables(svc, template));
    } catch (err) {
      return c.json({ statusCode: 404, message: (err as Error).message }, 404);
    }
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
  // PUT /api/sessions/:session/templates/:id
  // Edit a template. Only the fields sent are changed, so a dashboard can patch
  // the body without resending the name.
  router.put('/:session/templates/:id', async (c) => {
    const session = c.req.param('session');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const svc = container.resolve(TemplateService);
    try {
      const template = await svc.update(session, id, body);
      return c.json(template);
    } catch (err) {
      return c.json({ statusCode: 404, message: (err as Error).message }, 404);
    }
  });

  // POST /api/sessions/:session/templates/:id/preview
  // Render with the caller's variables without sending anything.
  router.post('/:session/templates/:id/preview', async (c) => {
    const session = c.req.param('session');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const svc = container.resolve(TemplateService);
    try {
      const template = await resolveTemplate(svc, session, id);
      const variables = (body?.variables ?? {}) as Record<string, unknown>;
      return c.json({
        text: svc.preview(template, variables),
        variables: svc.extractVariables([template.header, template.body, template.footer].filter(Boolean).join('\n')),
      });
    } catch (err) {
      return c.json({ statusCode: 404, message: (err as Error).message }, 404);
    }
  });

  // POST /api/sessions/:session/templates/:id/send
  // Render the template and send it to a chat. This is the step that was
  // missing: templates could be stored but never used.
  router.post('/:session/templates/:id/send', workingSessionResolver(), async (c) => {
    const sessionName = c.req.param('session');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));

    const chatId = body?.chatId;
    if (!chatId) {
      return c.json({ statusCode: 400, message: 'chatId is required' }, 400);
    }

    const svc = container.resolve(TemplateService);
    try {
      const template = await resolveTemplate(svc, sessionName, id);
      const text = svc.preview(template, (body?.variables ?? {}) as Record<string, unknown>);
      const session = c.get('session') as { sendText: (request: unknown) => Promise<unknown> };
      const sent = await session.sendText({
        session: sessionName,
        chatId,
        text,
        ...(body?.linkPreview !== undefined ? { linkPreview: body.linkPreview } : {}),
      });
      return c.json({ ...(sent as object), template: { id: template.id, name: template.name }, text }, 201);
    } catch (err) {
      return c.json({ statusCode: 400, message: (err as Error).message }, 400);
    }
  });

  // Templates are addressed by id or by name, so a workflow can send
  // "welcome-message" without looking the id up first.
  async function resolveTemplate(svc: TemplateService, session: string, idOrName: string) {
    try {
      return await svc.resolve(session, { templateId: idOrName });
    } catch {
      return await svc.resolve(session, { templateName: idOrName });
    }
  }

  // Variables are collected from the header, body and footer exactly as
  // preview() composes them, so the list response is self-describing.
  function withVariables(svc: TemplateService, template: Template) {
    return {
      ...template,
      variables: svc.extractVariables([template.header, template.body, template.footer].filter(Boolean).join('\n')),
    };
  }

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
