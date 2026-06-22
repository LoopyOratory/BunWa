import { Hono } from 'hono';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { SessionManager } from '../core/manager.core';
import { VERSION } from '../version';

export function createWorkersRouter(): Hono {
  const router = new Hono();

  router.use('*', apiKeyAuthMiddleware());

  router.get('/workers', async (c) => {
    const manager = container.resolve(SessionManager);
    const sessions = await manager.getSessions();
    
    return c.json([{
      name: 'WAHA',
      apiUrl: c.req.url.replace(/\/api\/workers$/, ''),
      engine: process.env.WHATSAPP_DEFAULT_ENGINE || 'NOWEB',
      version: VERSION.version || '2026.5.1',
      tier: VERSION.tier || 'PLUS',
      uptime: process.uptime().toString(),
      sessions: sessions.length,
      connected: true,
    }]);
  });

  return router;
}
