import 'reflect-metadata';
import { describe, it, expect, beforeAll } from 'bun:test';
import { Hono } from 'hono';
import { container } from 'tsyringe';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  authenticateWebSocket,
  createWsTicketRouter,
  resolveWsSession,
  WsTicketStore,
  type WsAuthDeps,
} from '../api/websocket-auth';
import { generateRestApiKey, hashRestApiKey } from '../core/api-keys/rest-api-keys';
import { AuditService } from '../core/audit/audit.service';
import { SessionManager } from '../core/manager.core';
import { WhatsappConfigService } from '../config.service';

// /ws used to check credentials on its own: it ignored WAHA_ALLOW_NO_AUTH=false,
// refused per-session keys, and the dashboard sent its admin password in the
// query string. It now follows the REST rules, pins a session key to its own
// session, and the dashboard connects with a single-use ticket.

const MASTER = 'ws-master-key';
const sessionKey = generateRestApiKey();
const readlessKey = generateRestApiKey();

const manager = {
  getSessions: async () => [{ name: 'alpha' }, { name: 'beta' }],
  getSessionConfig: (name: string) =>
    name === 'alpha'
      ? {
          restApiKeys: [
            { id: 'k1', session: 'alpha', name: 'reader', prefix: 'x', keyHash: hashRestApiKey(sessionKey), actions: ['read', 'send'], createdAt: '' },
            { id: 'k2', session: 'alpha', name: 'sender', prefix: 'y', keyHash: hashRestApiKey(readlessKey), actions: ['send'], createdAt: '' },
          ],
        }
      : {},
} as any;

function deps(overrides: Partial<WsAuthDeps> = {}): WsAuthDeps {
  return {
    apiKey: MASTER,
    dashboardCredentials: ['admin', 's3cret'],
    allowNoAuth: true,
    manager,
    tickets: new WsTicketStore(),
    ...overrides,
  };
}

function upgrade(query = '', headers: Record<string, string> = {}) {
  const url = new URL(`http://localhost/ws${query}`);
  return { req: new Request(url, { headers }), url };
}

const basic = (user: string, pass: string) => `Basic ${btoa(`${user}:${pass}`)}`;

describe('authenticateWebSocket', () => {
  it('accepts the master key in the header or the query', async () => {
    for (const { req, url } of [upgrade('', { 'x-api-key': MASTER }), upgrade(`?x-api-key=${MASTER}`)]) {
      const result = await authenticateWebSocket(req, url, deps());
      expect(result).toEqual({ ok: true, principal: { isAdmin: true } });
    }
  });

  it('accepts dashboard credentials as a Basic header or legacy query params', async () => {
    const header = upgrade('', { authorization: basic('admin', 's3cret') });
    expect((await authenticateWebSocket(header.req, header.url, deps())).ok).toBe(true);
    const query = upgrade('?user=admin&pass=s3cret');
    expect((await authenticateWebSocket(query.req, query.url, deps())).ok).toBe(true);
  });

  it('accepts a password that contains a colon', async () => {
    const { req, url } = upgrade('', { authorization: basic('admin', 'a:b') });
    const result = await authenticateWebSocket(req, url, deps({ dashboardCredentials: ['admin', 'a:b'] }));
    expect(result.ok).toBe(true);
  });

  it('refuses a wrong key even when dashboard credentials are also valid', async () => {
    const { req, url } = upgrade('?user=admin&pass=s3cret', { 'x-api-key': 'wrong' });
    expect((await authenticateWebSocket(req, url, deps())).ok).toBe(false);
  });

  it('refuses wrong dashboard credentials', async () => {
    const { req, url } = upgrade('?user=admin&pass=nope');
    expect(await authenticateWebSocket(req, url, deps())).toMatchObject({ ok: false, status: 401 });
  });

  it('scopes a per-session key with the read action to its session', async () => {
    const { req, url } = upgrade('', { 'x-api-key': sessionKey });
    const result = await authenticateWebSocket(req, url, deps());
    expect(result).toEqual({ ok: true, principal: { isAdmin: false, session: 'alpha' } });
  });

  it('refuses a per-session key without the read action', async () => {
    const { req, url } = upgrade('', { 'x-api-key': readlessKey });
    expect((await authenticateWebSocket(req, url, deps())).ok).toBe(false);
  });

  it('refuses an unauthenticated upgrade when an API key is configured', async () => {
    const { req, url } = upgrade();
    expect((await authenticateWebSocket(req, url, deps())).ok).toBe(false);
  });

  it('allows an unauthenticated upgrade only in keyless dev mode', async () => {
    const { req, url } = upgrade();
    expect((await authenticateWebSocket(req, url, deps({ apiKey: undefined }))).ok).toBe(true);
  });

  it('honours WAHA_ALLOW_NO_AUTH=false when no API key is configured', async () => {
    const { req, url } = upgrade();
    const result = await authenticateWebSocket(req, url, deps({ apiKey: undefined, allowNoAuth: false }));
    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  it('accepts a ticket once', async () => {
    const tickets = new WsTicketStore();
    const { ticket } = tickets.issue({ isAdmin: false, session: 'beta' });
    const first = upgrade(`?ticket=${ticket}`);
    expect(await authenticateWebSocket(first.req, first.url, deps({ tickets }))).toEqual({
      ok: true,
      principal: { isAdmin: false, session: 'beta' },
    });
    const replay = upgrade(`?ticket=${ticket}`);
    expect((await authenticateWebSocket(replay.req, replay.url, deps({ tickets }))).ok).toBe(false);
  });

  it('refuses an expired ticket', async () => {
    let now = 1_000;
    const tickets = new WsTicketStore(() => now);
    const { ticket } = tickets.issue({ isAdmin: true });
    now += 31_000;
    const { req, url } = upgrade(`?ticket=${ticket}`);
    expect((await authenticateWebSocket(req, url, deps({ tickets }))).ok).toBe(false);
  });
});

describe('resolveWsSession', () => {
  it('gives an admin the session it asked for, or every session', () => {
    expect(resolveWsSession({ isAdmin: true }, 'beta')).toEqual({ ok: true, session: 'beta' });
    expect(resolveWsSession({ isAdmin: true }, null)).toEqual({ ok: true, session: '*' });
  });

  it('pins a scoped key to its own session', () => {
    const scoped = { isAdmin: false, session: 'alpha' };
    expect(resolveWsSession(scoped, null)).toEqual({ ok: true, session: 'alpha' });
    expect(resolveWsSession(scoped, '*')).toEqual({ ok: true, session: 'alpha' });
    expect(resolveWsSession(scoped, 'alpha')).toEqual({ ok: true, session: 'alpha' });
    expect(resolveWsSession(scoped, 'beta')).toEqual({ ok: false });
  });
});

describe('POST /api/ws/ticket', () => {
  let app: Hono;
  const tickets = new WsTicketStore();

  beforeAll(() => {
    process.env.WAHA_API_KEY = MASTER;
    container.registerInstance(
      AuditService,
      new AuditService(mkdtempSync(join(tmpdir(), 'bunwa-ws-audit-'))),
    );
    container.registerInstance(WhatsappConfigService, new WhatsappConfigService());
    container.registerInstance(SessionManager, {
      ...manager,
      touchRestApiKey: async () => {},
    } as any);
    app = new Hono();
    app.route('/api', createWsTicketRouter(tickets));
  });

  const post = (headers: Record<string, string>) =>
    app.fetch(new Request('http://localhost/api/ws/ticket', { method: 'POST', headers }));

  it('issues an admin ticket for the master key', async () => {
    const res = await post({ 'x-api-key': MASTER });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.expiresInSeconds).toBe(30);
    expect(tickets.consume(body.ticket)).toEqual({ isAdmin: true });
  });

  it('issues a session-pinned ticket for a session key', async () => {
    const res = await post({ 'x-api-key': sessionKey });
    expect(res.status).toBe(200);
    expect(tickets.consume((await res.json()).ticket)).toEqual({ isAdmin: false, session: 'alpha' });
  });

  it('refuses a session key without the read action', async () => {
    expect((await post({ 'x-api-key': readlessKey })).status).toBe(403);
  });

  it('refuses a caller without credentials', async () => {
    expect((await post({})).status).toBe(401);
  });
});
