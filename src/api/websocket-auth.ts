import { Hono } from 'hono';
import { randomBytes, timingSafeEqual } from 'crypto';
import { apiKeyAuthMiddleware, User } from '../middleware/api-key-auth';
import { policiesMiddleware, CanSession, Action } from '../middleware/policies';
import { isRestApiKey, resolveRestApiKey } from '../core/api-keys/rest-api-keys';
import type { SessionManager } from '../core/manager.core';

/** Who opened a WebSocket: an admin sees every session, a scoped key one. */
export interface WsPrincipal {
  isAdmin: boolean;
  session?: string;
}

export type WsAuthResult =
  | { ok: true; principal: WsPrincipal }
  | { ok: false; status: 401 | 403; reason: string };

const TICKET_TTL_MS = 30_000;

/**
 * Single-use, short-lived WebSocket tickets.
 *
 * A browser cannot set headers on a WebSocket, so the dashboard used to put
 * its admin username and password in the `/ws` query string, where reverse
 * proxies and access logs record them. Instead it now asks an authenticated
 * REST endpoint for a ticket and connects with `?ticket=`. A ticket is good
 * for one upgrade within 30 seconds, so a logged URL is worthless.
 */
export class WsTicketStore {
  private tickets = new Map<string, { principal: WsPrincipal; expiresAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  issue(principal: WsPrincipal): { ticket: string; expiresInSeconds: number } {
    this.prune();
    const ticket = randomBytes(24).toString('base64url');
    this.tickets.set(ticket, { principal, expiresAt: this.now() + TICKET_TTL_MS });
    return { ticket, expiresInSeconds: TICKET_TTL_MS / 1000 };
  }

  consume(ticket: string): WsPrincipal | null {
    const entry = this.tickets.get(ticket);
    if (!entry) return null;
    this.tickets.delete(ticket);
    return entry.expiresAt > this.now() ? entry.principal : null;
  }

  private prune(): void {
    const now = this.now();
    for (const [ticket, entry] of this.tickets) {
      if (entry.expiresAt <= now) this.tickets.delete(ticket);
    }
  }
}

export const wsTickets = new WsTicketStore();

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function decodeBasic(header: string | null): [string, string] | null {
  if (!header?.startsWith('Basic ')) return null;
  try {
    const decoded = atob(header.slice('Basic '.length));
    const separator = decoded.indexOf(':');
    if (separator < 0) return null;
    return [decoded.slice(0, separator), decoded.slice(separator + 1)];
  } catch {
    return null;
  }
}

export interface WsAuthDeps {
  apiKey?: string;
  dashboardCredentials: [string, string] | null;
  allowNoAuth: boolean;
  manager: Pick<SessionManager, 'getSessions' | 'getSessionConfig'>;
  tickets: WsTicketStore;
}

/**
 * Authenticate a `/ws` upgrade with the same rules as the REST API.
 *
 * Accepted, in order: a ticket from `POST /api/ws/ticket`; the master key or a
 * per-session `sk_ses_` key (with the `read` action) in the `x-api-key` header
 * or query parameter; dashboard credentials as a Basic header or the legacy
 * `user`/`pass` query parameters. With none of these, the connection is
 * allowed only when no API key is configured and `WAHA_ALLOW_NO_AUTH` is not
 * `false` — the same keyless dev mode REST honours. A credential that is
 * present but wrong is always refused rather than falling through.
 */
export async function authenticateWebSocket(
  req: { headers: { get(name: string): string | null } },
  url: URL,
  deps: WsAuthDeps,
): Promise<WsAuthResult> {
  const ticket = url.searchParams.get('ticket');
  if (ticket) {
    const principal = deps.tickets.consume(ticket);
    return principal
      ? { ok: true, principal }
      : { ok: false, status: 401, reason: 'invalid or expired ticket' };
  }

  const providedKey = req.headers.get('x-api-key') || url.searchParams.get('x-api-key');
  if (providedKey) {
    if (deps.apiKey && safeCompare(providedKey, deps.apiKey)) {
      return { ok: true, principal: { isAdmin: true } };
    }
    if (isRestApiKey(providedKey)) {
      const resolved = await resolveRestApiKey(deps.manager as SessionManager, providedKey);
      if (resolved && resolved.record.actions.includes(Action.Read)) {
        return { ok: true, principal: { isAdmin: false, session: resolved.session } };
      }
    }
    return { ok: false, status: 401, reason: 'invalid API key' };
  }

  const basic =
    decodeBasic(req.headers.get('authorization')) ??
    (url.searchParams.get('user') && url.searchParams.get('pass')
      ? [url.searchParams.get('user')!, url.searchParams.get('pass')!] as [string, string]
      : null);
  if (basic) {
    const creds = deps.dashboardCredentials;
    if (creds && safeCompare(basic[0], creds[0]) && safeCompare(basic[1], creds[1])) {
      return { ok: true, principal: { isAdmin: true } };
    }
    return { ok: false, status: 401, reason: 'invalid credentials' };
  }

  if (!deps.apiKey && deps.allowNoAuth) {
    return { ok: true, principal: { isAdmin: true } };
  }
  return { ok: false, status: 401, reason: 'authentication required' };
}

/**
 * Pick the session a principal may stream. An admin gets what it asked for;
 * a scoped key is pinned to its own session, and asking for another one is
 * refused instead of silently narrowed.
 */
export function resolveWsSession(
  principal: WsPrincipal,
  requested: string | null,
): { ok: true; session: string } | { ok: false } {
  const wanted = requested || '*';
  if (principal.isAdmin) {
    return { ok: true, session: wanted };
  }
  if (!principal.session) {
    return { ok: false };
  }
  if (wanted !== '*' && wanted !== principal.session) {
    return { ok: false };
  }
  return { ok: true, session: principal.session };
}

/** `POST /api/ws/ticket` — trade the caller's credentials for a WebSocket ticket. */
export function createWsTicketRouter(tickets: WsTicketStore = wsTickets): Hono {
  const router = new Hono();
  router.use('*', apiKeyAuthMiddleware());
  router.post('/ws/ticket', policiesMiddleware(CanSession(Action.Read)), (c) => {
    const user = c.get('user' as never) as User;
    const principal: WsPrincipal = user.isAdmin
      ? { isAdmin: true }
      : { isAdmin: false, session: user.session };
    return c.json(tickets.issue(principal));
  });
  return router;
}
