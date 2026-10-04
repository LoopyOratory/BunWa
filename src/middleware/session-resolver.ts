import { MiddlewareHandler } from 'hono';
import { container } from 'tsyringe';
import { SessionManager } from '../core/manager.core';
import {
  NotFoundException,
  UnprocessableEntityException,
} from '../core/exceptions';

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

/**
 * Resolve a working session and put it on the context.
 *
 * A missing session is a client error: 404 when the name is unknown, 422 when
 * the session exists but is not connected (stopped, starting, waiting for a QR
 * scan or failed), so a caller knows it has to start the session first. This is
 * the shared guard every route uses instead of calling getSession() inline,
 * which is what turned both cases into a 500.
 */
async function workingSessionResponse(c: any, sessionName: string | undefined) {
  if (!sessionName) {
    return c.json({ statusCode: 400, message: 'Session name required' }, 400);
  }

  const manager = container.resolve(SessionManager);
  try {
    const session = await manager.getWorkingSession(sessionName);
    c.set('session', session);
    return null;
  } catch (error) {
    if (error instanceof NotFoundException) {
      return c.json({ statusCode: 404, message: `Session ${sessionName} not found` }, 404);
    }
    if (error instanceof UnprocessableEntityException) {
      return c.json({ statusCode: 422, message: error.message }, 422);
    }
    throw error;
  }
}

/// Session comes from the :session path parameter.
export function workingSessionResolver(): MiddlewareHandler {
  return async (c, next) => {
    const response = await workingSessionResponse(c, c.req.param('session'));
    if (response) return response;
    return next();
  };
}

/// Session comes from the ?session= query parameter.
export function workingSessionQueryResolver(): MiddlewareHandler {
  return async (c, next) => {
    const response = await workingSessionResponse(c, c.req.query('session'));
    if (response) return response;
    return next();
  };
}
