import { Hono } from 'hono';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanSession, Action, FromParam } from '../middleware/policies';
import { SessionManager } from '../core/manager.core';
import { isClientFacingError } from '../core/exceptions';

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
        // Let the engine's mapped 422 (a non chrome based engine, or a session
        // that is starting or waiting for a QR scan) reach the caller through
        // the shared error handler. Flattening it into a 400 hid the reason and
        // reported a gated capability as a bad request.
        if (isClientFacingError(error)) throw error;
        // Surface the engine's message instead of a generic "Invalid request"
        // so the dashboard can tell "not started" from "page not available".
        const message = error instanceof Error ? error.message : String(error);
        return c.json({ statusCode: 400, message: `Failed to take screenshot: ${message}` }, 400);
      }
    }
  );

  return router;
}
