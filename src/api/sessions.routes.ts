import { Hono } from 'hono';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanSession, CanServer, Action, FromParam } from '../middleware/policies';
import { SessionManager } from '../core/manager.core';
import { BadRequestException, NotFoundException } from '../core/exceptions';
import pino from 'pino';

const routeLogger = pino({ name: 'SessionRoutes' });

export function createSessionsRouter(): Hono {
  const router = new Hono();

  router.use('*', apiKeyAuthMiddleware());

  // GET /api/sessions - List all sessions (requires server-level access)
  router.get('/',
    policiesMiddleware(CanServer(Action.Read)),
    async (c) => {
      const manager = container.resolve(SessionManager);
      const sessions = await manager.getSessions();
      return c.json(sessions);
    }
  );

  // GET /api/sessions/:session - Get session info
  router.get('/:session',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    async (c) => {
      const manager = container.resolve(SessionManager);
      const sessionName = c.req.param('session');

      try {
        const session = manager.getSession(sessionName);
        return c.json({
          name: sessionName,
          status: (session as any).status || 'STOPPED',
          config: (session as any).sessionConfig || {},
          me: (session as any).getSessionMeInfo?.() || null,
        });
      } catch (error: any) {
        routeLogger.error({ err: error.stack || error.message }, `GET /:session error for ${sessionName}`);
        if (error instanceof NotFoundException) {
          return c.json({ name: sessionName, status: 'STOPPED', config: {}, me: null });
        }
        throw error;
      }
    }
  );

  // POST /api/sessions - Create session (requires server-level access)
  router.post('/',
    policiesMiddleware(CanServer(Action.Create)),
    async (c) => {
      const manager = container.resolve(SessionManager);
      const body = await c.req.json();
      const name = body.name || 'default';

      await manager.upsert(name, body.config || {});

      return c.json({
        name,
        status: 'STOPPED',
        config: body.config || {},
      });
    }
  );

  // PUT /api/sessions/:session - Update session
  router.put('/:session',
    policiesMiddleware(CanSession(Action.Setting, FromParam('session'))),
    async (c) => {
      const manager = container.resolve(SessionManager);
      const sessionName = c.req.param('session');
      const body = await c.req.json();

      await manager.upsert(sessionName, body.config || {});
      // Re-wire webhook subscriptions so config changes (e.g. a webhook added
      // or edited from the dashboard's Session Settings dialog, which saves
      // through this generic endpoint rather than the dedicated webhook CRUD
      // routes) take effect immediately on an already-running session instead
      // of only after a restart.
      await manager.resyncWebhooks(sessionName);

      return c.json({
        name: sessionName,
        status: 'STOPPED',
        config: body.config || {},
      });
    }
  );

  // DELETE /api/sessions/:session - Delete session
  router.delete('/:session',
    policiesMiddleware(CanSession(Action.Delete, FromParam('session'))),
    async (c) => {
      const manager = container.resolve(SessionManager);
      const sessionName = c.req.param('session');

      try {
        await manager.delete(sessionName);
      } catch (error: any) {
        routeLogger.error({ err: error.stack || error.message }, `DELETE /:session error for ${sessionName}`);
        if (error instanceof NotFoundException) {
          return c.json({ statusCode: 404, message: error.message }, 404);
        }
        if (error instanceof BadRequestException) {
          return c.json({ statusCode: 400, message: error.message }, 400);
        }
        return c.json({ statusCode: 500, message: 'Internal server error' }, 500);
      }

      return c.json({ result: true });
    }
  );

  // POST /api/sessions/:session/start - Start session
  router.post('/:session/start',
    policiesMiddleware(CanSession(Action.Control, FromParam('session'))),
    async (c) => {
      const manager = container.resolve(SessionManager);
      const sessionName = c.req.param('session');

      try {
        const result = await manager.start(sessionName);
        return c.json({
          name: sessionName,
          status: result.status || 'STARTING',
          config: result.config || {},
        });
      } catch (error: any) {
        routeLogger.error({ err: error.stack || error.message }, `POST /:session/start error for ${sessionName}`);
        if (error instanceof BadRequestException) {
          return c.json({ statusCode: 400, message: error.message }, 400);
        }
        if (error instanceof NotFoundException) {
          return c.json({ statusCode: 404, message: error.message }, 404);
        }
        return c.json({ statusCode: 500, message: 'Internal server error' }, 500);
      }
    }
  );

  // POST /api/sessions/:session/stop - Stop session
  router.post('/:session/stop',
    policiesMiddleware(CanSession(Action.Control, FromParam('session'))),
    async (c) => {
      const manager = container.resolve(SessionManager);
      const sessionName = c.req.param('session');

      try {
        await manager.stop(sessionName);
      } catch (error: any) {
        routeLogger.error({ err: error.stack || error.message }, `POST /:session/stop error for ${sessionName}`);
        if (error instanceof NotFoundException) {
          return c.json({ statusCode: 404, message: error.message }, 404);
        }
        if (error instanceof BadRequestException) {
          return c.json({ statusCode: 400, message: error.message }, 400);
        }
        return c.json({ statusCode: 500, message: 'Internal server error' }, 500);
      }

      return c.json({
        name: sessionName,
        status: 'STOPPED',
        config: {},
      });
    }
  );

  // POST /api/sessions/:session/logout - Logout session
  router.post('/:session/logout',
    policiesMiddleware(CanSession(Action.Control, FromParam('session'))),
    async (c) => {
      const manager = container.resolve(SessionManager);
      const sessionName = c.req.param('session');

      try {
        await manager.logout(sessionName);
      } catch (error: any) {
        routeLogger.error({ err: error.stack || error.message }, `POST /:session/logout error for ${sessionName}`);
        if (error instanceof NotFoundException) {
          return c.json({ statusCode: 404, message: error.message }, 404);
        }
        if (error instanceof BadRequestException) {
          return c.json({ statusCode: 400, message: error.message }, 400);
        }
        return c.json({ statusCode: 500, message: 'Internal server error' }, 500);
      }

      return c.json({ result: true });
    }
  );

  // POST /api/sessions/:session/restart - Restart session
  router.post('/:session/restart',
    policiesMiddleware(CanSession(Action.Control, FromParam('session'))),
    async (c) => {
      const manager = container.resolve(SessionManager);
      const sessionName = c.req.param('session');

      try {
        const result = await manager.restart(sessionName);
        return c.json({
          name: sessionName,
          status: result.status || 'STARTING',
          config: result.config || {},
        });
      } catch (error: any) {
        routeLogger.error({ err: error.stack || error.message }, `POST /:session/restart error for ${sessionName}`);
        if (error instanceof NotFoundException) {
          return c.json({ statusCode: 404, message: error.message }, 404);
        }
        if (error instanceof BadRequestException) {
          return c.json({ statusCode: 400, message: error.message }, 400);
        }
        return c.json({ statusCode: 500, message: 'Internal server error' }, 500);
      }
    }
  );

  // ===== OpenWA parity: config inspection/update =====
  router.get('/:session/config',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    async (c) => {
      const manager = container.resolve(SessionManager);
      const sessionName = c.req.param('session');
      try {
        const session = manager.getSession(sessionName);
        return c.json({ name: sessionName, config: (session as any).sessionConfig || {} });
      } catch (e: any) {
        return c.json({ error: String(e?.message || e) }, 404);
      }
    }
  );

  router.patch('/:session/config',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    async (c) => {
      const body = await c.req.json().catch(() => ({}));
      const manager = container.resolve(SessionManager);
      const sessionName = c.req.param('session');
      try {
        const session = manager.getSession(sessionName);
        if (typeof (session as any).updateConfig === 'function') {
          await (session as any).updateConfig(body);
          return c.json({ success: true, updated: body });
        }
        (session as any).sessionConfig = { ...((session as any).sessionConfig || {}), ...body };
        return c.json({ success: true, updated: body, note: 'merged into runtime sessionConfig' });
      } catch (e: any) {
        return c.json({ success: false, error: String(e?.message || e) }, 500);
      }
    }
  );

  // ===== OpenWA parity: force kill (no graceful drain) =====
  router.post('/:session/force-kill',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    async (c) => {
      const name = c.req.param('session');
      const manager = container.resolve(SessionManager);
      try {
        try { await manager.logout(name); } catch {}
        await manager.delete(name);
        return c.json({ success: true, killed: name });
      } catch (e: any) {
        return c.json({ success: false, error: String(e?.message || e) }, 500);
      }
    }
  );

  return router;
}
