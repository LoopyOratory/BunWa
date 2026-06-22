import { container } from 'tsyringe';
import { SessionManager } from '../core/manager.core';

/**
 * Middleware that extracts the session name from the request body,
 * resolves the session from the SessionManager, and sets it on the context.
 */
export function getSessionFromBody() {
  return async (c: any, next: any) => {
    const body = await c.req.json();
    const sessionName = body.session;
    if (!sessionName) {
      return c.json({ statusCode: 400, message: 'Session name required in body' }, 400);
    }
    const manager = container.resolve(SessionManager);
    try {
      const session = manager.getSession(sessionName);
      c.set('session', session);
      c.set('body', body);
      return next();
    } catch {
      return c.json({ statusCode: 404, message: `Session ${sessionName} not found` }, 404);
    }
  };
}
