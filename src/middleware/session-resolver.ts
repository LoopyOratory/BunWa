import { MiddlewareHandler } from 'hono';
import { container } from 'tsyringe';
import { SessionManager } from '../core/manager.core';

export function sessionResolver(): MiddlewareHandler {
  return async (c, next) => {
    const manager = container.resolve(SessionManager);
    const sessionName = c.req.param('session');

    if (!sessionName) {
      return c.json({ statusCode: 400, message: 'Session name required' }, 400);
    }

    try {
      const session = manager.getSession(sessionName);
      c.set('session', session);
      return next();
    } catch {
      return c.json({ statusCode: 404, message: `Session ${sessionName} not found` }, 404);
    }
  };
}

export function workingSessionResolver(): MiddlewareHandler {
  return async (c, next) => {
    const manager = container.resolve(SessionManager);
    const sessionName = c.req.param('session');

    if (!sessionName) {
      return c.json({ statusCode: 400, message: 'Session name required' }, 400);
    }

    try {
      const session = await manager.getWorkingSession(sessionName);
      c.set('session', session);
      return next();
    } catch (error) {
      return c.json({ statusCode: 404, message: `Session ${sessionName} not found or not working` }, 404);
    }
  };
}
