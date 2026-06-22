import { Hono } from 'hono';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanSession, Action, FromParam } from '../middleware/policies';
import { SessionManager } from '../core/manager.core';

export function createScreenshotRouter(): Hono {
  const router = new Hono();

  router.use('*', apiKeyAuthMiddleware());

  router.get('/:session/screenshot',
    policiesMiddleware(CanSession(Action.Control, FromParam('session'))),
    async (c) => {
      const manager = container.resolve(SessionManager);
      const sessionName = c.req.param('session');

      let session;
      try {
        session = manager.getSession(sessionName);
      } catch {
        return c.json({ error: `Session '${sessionName}' is not running. Start the session first.` }, 400);
      }

      try {
        const buffer = await session.getScreenshot();
        const base64 = buffer.toString('base64');
        return c.json({ screenshot: base64 });
      } catch (error) {
        return c.json({ statusCode: 400, message: 'Invalid request' }, 400);
      }
    }
  );

  return router;
}
