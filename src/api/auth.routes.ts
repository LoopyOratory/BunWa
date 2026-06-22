import { Hono } from 'hono';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanSession, Action, FromParam } from '../middleware/policies';
import { SessionManager } from '../core/manager.core';

export function createAuthRouter(): Hono {
  const router = new Hono();

  router.use('*', apiKeyAuthMiddleware());

  // GET /api/:session/auth/qr - Get QR code
  router.get('/:session/auth/qr',
    policiesMiddleware(CanSession(Action.Control, FromParam('session'))),
    async (c) => {
      const manager = container.resolve(SessionManager);
      const sessionName = c.req.param('session');
      const phoneNumber = c.req.query('phoneNumber');

      try {
        let session;
        try {
          session = manager.getSession(sessionName);
        } catch {
          return c.json({ error: `Session '${sessionName}' not found. Start the session first.`, status: 'STOPPED' }, 400);
        }

        const status = (session as any).status;

        if (status !== 'SCAN_QR_CODE') {
          return c.json({
            error: `Session is not in QR code state. Current status: ${status}`,
            status,
          }, 400);
        }

        // Get QR code from session
        const qr = await (session as any).getQR?.();

        // If phoneNumber is provided, also request pairing code
        if (phoneNumber && qr && (session as any).requestCode) {
          try {
            const pairingCode = await (session as any).requestCode(phoneNumber, null, null);
            return c.json({ qr, pairingCode: pairingCode?.code || pairingCode });
          } catch {
            return c.json({ qr });
          }
        }

        if (qr) {
          return c.json({ qr });
        }

        return c.json({ error: 'QR code not available' }, 404);
      } catch (error) {
        return c.json({ statusCode: 500, message: 'Internal server error' }, 500);
      }
    }
  );

  // POST /api/:session/auth/request-code - Request pairing code
  router.post('/:session/auth/request-code',
    policiesMiddleware(CanSession(Action.Control, FromParam('session'))),
    async (c) => {
      const manager = container.resolve(SessionManager);
      const sessionName = c.req.param('session');
      const body = await c.req.json();

      try {
        const session = manager.getSession(sessionName);
        const result = await (session as any).requestCode?.(body.phoneNumber, body.method, body);
        return c.json(result || { result: true });
      } catch (error) {
        return c.json({ statusCode: 500, message: 'Internal server error' }, 500);
      }
    }
  );

  return router;
}
