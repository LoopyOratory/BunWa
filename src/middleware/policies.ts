import { MiddlewareHandler } from 'hono';
import { User } from './api-key-auth';

export enum Action {
  Manage = 'manage',
  List = 'list',
  Retrieve = 'retrieve',
  Create = 'create',
  Delete = 'delete',
  Setting = 'setting',
  Control = 'control',
  App = 'app',
  Read = 'read',
  Send = 'send',
}

export type PolicyCheck = (user: User | null, context: any) => boolean;

export function policiesMiddleware(...checks: PolicyCheck[]): MiddlewareHandler {
  return async (c, next) => {
    const user = c.get('user') as User | null;

    if (!checks.length) {
      return c.json({ statusCode: 403, message: 'Forbidden' }, 403);
    }

    const ok = checks.every((check) => check(user, c));
    if (!ok) {
      return c.json({ statusCode: 403, message: 'Forbidden' }, 403);
    }

    return next();
  };
}

export function CanSession(action: Action, getSessionName?: (c: any) => string): PolicyCheck {
  return (user, c) => {
    if (!user) return false;
    if (user.isAdmin) return true;
    if (!user.session) return false;
    // Enforce session ownership: non-admin users can only access their own session
    if (getSessionName) {
      const requestedSession = getSessionName(c);
      if (requestedSession && requestedSession !== user.session) {
        return false;
      }
    }
    return true;
  };
}

export function CanServer(action: Action): PolicyCheck {
  return (user, c) => {
    if (!user) return false;
    return user.isAdmin;
  };
}

export function FromParam(key: string = 'session'): (c: any) => string {
  return (c) => c.req.param(key);
}

export function FromBody(key: string = 'session'): (c: any) => string {
  return (c) => {
    try {
      const body = c.get('validatedBody');
      return body?.[key];
    } catch {
      return undefined;
    }
  };
}

export function FromQuery(key: string = 'session'): (c: any) => string {
  return (c) => c.req.query(key);
}
