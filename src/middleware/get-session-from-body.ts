import { container } from 'tsyringe';
import { SessionManager } from '../core/manager.core';
import {
  NotFoundException,
  UnprocessableEntityException,
} from '../core/exceptions';

/**
 * Middleware that extracts the session name from the request body, resolves a
 * working session from the SessionManager, and sets it on the context.
 *
 * Sends and other body-addressed operations cannot run on a session that is
 * not connected, so this uses the same getWorkingSession() guard as the
 * path/query resolvers: 404 for an unknown name, 422 naming the current
 * status when the session exists but is not WORKING. Resolving without the
 * guard let a disconnected session reach the engine, where the failure
 * surfaced as an opaque 500.
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
      const session = await manager.getWorkingSession(sessionName);
      c.set('session', session);
      c.set('body', body);
      return next();
    } catch (error) {
      if (error instanceof NotFoundException) {
        return c.json({ statusCode: 404, message: `Session ${sessionName} not found` }, 404);
      }
      if (error instanceof UnprocessableEntityException) {
        return c.json({ statusCode: 422, message: error.message }, 422);
      }
      throw error;
    }
  };
}
