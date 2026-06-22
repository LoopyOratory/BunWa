import { Hono } from 'hono';
import { container } from 'tsyringe';
import { WhatsappConfigService } from '../config.service';
import { VERSION } from '../version';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanServer, Action } from '../middleware/policies';

export function createServerRouter(): Hono {
  const router = new Hono();

  router.use('*', apiKeyAuthMiddleware());

  router.get('/version', (c) => {
    return c.json(VERSION);
  });

  router.get('/environment',
    policiesMiddleware(CanServer(Action.Retrieve)),
    (c) => {
      return c.json({
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        uptime: process.uptime(),
      });
    }
  );

  router.get('/status', (c) => {
    const config = container.resolve(WhatsappConfigService);
    return c.json({
      uptime: process.uptime(),
      worker: config.workerId,
    });
  });

  router.post('/stop',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      setTimeout(() => process.exit(0), 1000);
      return c.json({ result: true });
    }
  );

  return router;
}
