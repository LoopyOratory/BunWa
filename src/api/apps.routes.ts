import { Hono } from 'hono';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanServer, Action } from '../middleware/policies';
import { ChatwootAppService } from '../apps/chatwoot/services/ChatwootAppService';

export function createAppsRouter(): Hono {
  const router = new Hono();

  router.use('*', apiKeyAuthMiddleware());

  // ── Apps listing ───────────────────────────────────────────────

  // GET /api/apps - List all apps
  router.get('/apps',
    policiesMiddleware(CanServer(Action.Read)),
    async (c) => {
      const appService = container.resolve(ChatwootAppService);
      const apps = await appService.listApps();
      return c.json(apps);
    }
  );

  // POST /api/apps - Create app
  router.post('/apps',
    policiesMiddleware(CanServer(Action.Create)),
    async (c) => {
      const appService = container.resolve(ChatwootAppService);
      const body = await c.req.json();

      // Validate required chatwoot config fields
      if (body.app === 'chatwoot') {
        if (!body.session) {
          return c.json({ statusCode: 400, message: 'session is required' }, 400);
        }
        if (!body.config?.url) {
          return c.json({ statusCode: 400, message: 'config.url is required' }, 400);
        }
        if (!body.config?.accountId) {
          return c.json({ statusCode: 400, message: 'config.accountId is required' }, 400);
        }
        if (!body.config?.accountToken) {
          return c.json({ statusCode: 400, message: 'config.accountToken is required' }, 400);
        }
        if (!body.config?.inboxId) {
          return c.json({ statusCode: 400, message: 'config.inboxId is required' }, 400);
        }
      }

      const app = await appService.createApp(body);
      return c.json(app, 201);
    }
  );

  // GET /api/apps/:id - Get app
  router.get('/apps/:id',
    policiesMiddleware(CanServer(Action.Read)),
    async (c) => {
      const appService = container.resolve(ChatwootAppService);
      const id = c.req.param('id');
      const app = await appService.getApp(id);
      if (!app) {
        return c.json({ statusCode: 404, message: 'App not found' }, 404);
      }
      return c.json(app);
    }
  );

  // PUT /api/apps/:id - Update app
  router.put('/apps/:id',
    policiesMiddleware(CanServer(Action.Setting)),
    async (c) => {
      const appService = container.resolve(ChatwootAppService);
      const id = c.req.param('id');
      const body = await c.req.json();
      const app = await appService.updateApp(id, body);
      if (!app) {
        return c.json({ statusCode: 404, message: 'App not found' }, 404);
      }
      return c.json(app);
    }
  );

  // DELETE /api/apps/:id - Delete app
  router.delete('/apps/:id',
    policiesMiddleware(CanServer(Action.Delete)),
    async (c) => {
      const appService = container.resolve(ChatwootAppService);
      const id = c.req.param('id');
      const deleted = await appService.deleteApp(id);
      if (!deleted) {
        return c.json({ statusCode: 404, message: 'App not found' }, 404);
      }
      return c.json({ result: true });
    }
  );

  // GET /api/apps/chatwoot/locales - Chatwoot locales
  router.get('/apps/chatwoot/locales',
    policiesMiddleware(CanServer(Action.Read)),
    async (c) => {
      return c.json([
        { code: 'en-US', name: 'English (US)' },
        { code: 'pt-BR', name: 'Português (Brasil)' },
        { code: 'es', name: 'Español' },
        { code: 'id', name: 'Bahasa Indonesia' },
        { code: 'fr', name: 'Français' },
        { code: 'de', name: 'Deutsch' },
        { code: 'zh-CN', name: '简体中文' },
        { code: 'ar', name: 'العربية' },
        { code: 'bn', name: 'বাংলা' },
        { code: 'he', name: 'עברית' },
      ]);
    }
  );

  return router;
}
