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

    // Session-scoped principals are matched against the request's target
    // session by CanSession. Body-derived session names must be available
    // before route-level body middleware runs, so parse a JSON body once here
    // (Hono caches it) and expose it as `validatedBody`. Only scoped
    // principals pay this cost; admin requests keep streaming untouched.
    if (user && !user.isAdmin) {
      const contentType = c.req.header('content-type') || '';
      if (contentType.includes('application/json') || contentType.includes('+json')) {
        const body = await c.req.json().catch(() => undefined);
        if (body && typeof body === 'object') {
          c.set('validatedBody', body);
        }
      }
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
    // A scoped key carries an allowlist of actions; anything not listed is
    // denied even on its own session.
    if (user.actions?.[action] !== true) return false;
    // Enforce session ownership: non-admin users can only access their own
    // session. Fail closed when an extractor is present but produced no
    // session, so a missing body/query field can never widen access.
    if (getSessionName) {
      const requestedSession = getSessionName(c);
      if (!requestedSession || requestedSession !== user.session) {
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
