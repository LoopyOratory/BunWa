import 'reflect-metadata';
import { describe, it, expect, beforeAll } from 'bun:test';
import { Hono } from 'hono';
import { container } from 'tsyringe';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createApiRouter } from '../api';
import { AuditService } from '../core/audit/audit.service';
import { SessionManager } from '../core/manager.core';
import { WhatsappConfigService } from '../config.service';
import { globalErrorHandler } from '../middleware/error-handler';
import {
  NotImplementedByEngineError,
  UnprocessableEntityException,
} from '../core/exceptions';

// The four routes that used to answer 500 without a live session. They must
// answer 404 for an unknown session and 422 for a known but not connected one.
process.env.WAHA_API_KEY = 'session-guard-test-key';

const API_KEY = 'session-guard-test-key';

const ROUTES: Array<{ name: string; path: (session: string) => string }> = [
  {
    name: 'GET /api/checkNumberStatus',
    path: (session) => `/api/checkNumberStatus?session=${session}&phone=00000000000`,
  },
  {
    name: 'GET /api/:session/new-message-id',
    path: (session) => `/api/${session}/new-message-id`,
  },
  {
    name: 'GET /api/contacts/check-exists',
    path: (session) => `/api/contacts/check-exists?session=${session}&phone=00000000000`,
  },
  {
    name: 'GET /api/contacts/profile-picture',
    path: (session) => `/api/contacts/profile-picture?session=${session}&contactId=00000000000`,
  },
];

describe('Session guard on read routes', () => {
  let app: Hono;

  beforeAll(async () => {
    container.registerInstance(
      AuditService,
      new AuditService(mkdtempSync(join(tmpdir(), 'bunwa-guard-audit-'))),
    );
    container.registerInstance(WhatsappConfigService, new WhatsappConfigService());
    container.registerInstance(
      SessionManager,
      new SessionManager(container.resolve(WhatsappConfigService)),
    );

    app = new Hono();
    app.route('/', createApiRouter());

    // Creates a known session that exists but is stopped (not connected).
    const created = await app.fetch(
      new Request('http://localhost/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body: JSON.stringify({ name: 'guard-stopped' }),
      }),
    );
    expect(created.status).toBe(200);
  });

  for (const route of ROUTES) {
    it(`${route.name}: 404 names the unknown session`, async () => {
      const res = await app.fetch(
        new Request(`http://localhost${route.path('guard-missing')}`, {
          headers: { 'x-api-key': API_KEY },
        }),
      );
      expect(res.status).toBe(404);
      const body: any = await res.json();
      expect(body.message).toContain('guard-missing');
      expect(body.message).not.toContain('stack');
    });

    it(`${route.name}: 422 says the known session is not connected`, async () => {
      const res = await app.fetch(
        new Request(`http://localhost${route.path('guard-stopped')}`, {
          headers: { 'x-api-key': API_KEY },
        }),
      );
      expect(res.status).toBe(422);
      const body: any = await res.json();
      expect(body.message).toContain('not connected');
      expect(body.message).not.toContain('stack');
    });
  }
});

// Body-addressed routes (sends, block/unblock) used to resolve the session
// without the working guard, so a stopped session reached the engine and the
// failure surfaced as a 500. They must answer the same 404/422 pair.
const BODY_ROUTES: Array<{ name: string; path: string; body: (session: string) => unknown }> = [
  {
    name: 'POST /api/sendText',
    path: '/api/sendText',
    body: (session) => ({ session, chatId: '00000000000@c.us', text: 'guard probe' }),
  },
  {
    name: 'POST /api/contacts/block',
    path: '/api/contacts/block',
    body: (session) => ({ session, contactId: '00000000000@c.us' }),
  },
];

describe('Session guard on body-addressed routes', () => {
  let app: Hono;

  beforeAll(async () => {
    container.registerInstance(
      AuditService,
      new AuditService(mkdtempSync(join(tmpdir(), 'bunwa-body-guard-audit-'))),
    );
    container.registerInstance(WhatsappConfigService, new WhatsappConfigService());
    container.registerInstance(
      SessionManager,
      new SessionManager(container.resolve(WhatsappConfigService)),
    );

    app = new Hono();
    app.route('/', createApiRouter());

    const created = await app.fetch(
      new Request('http://localhost/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body: JSON.stringify({ name: 'body-guard-stopped' }),
      }),
    );
    expect(created.status).toBe(200);
  });

  const post = (path: string, body: unknown): Promise<Response> =>
    app.fetch(
      new Request(`http://localhost${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body: JSON.stringify(body),
      }),
    );

  for (const route of BODY_ROUTES) {
    it(`${route.name}: 404 names the unknown session`, async () => {
      const res = await post(route.path, route.body('body-guard-missing'));
      expect(res.status).toBe(404);
      const body: any = await res.json();
      expect(body.message).toContain('body-guard-missing');
      expect(body.message).not.toContain('stack');
    });

    it(`${route.name}: 422 says the known session is not connected`, async () => {
      const res = await post(route.path, route.body('body-guard-stopped'));
      expect(res.status).toBe(422);
      const body: any = await res.json();
      expect(body.message).toContain('not connected');
      expect(body.message).not.toContain('stack');
    });
  }
});

// A gated engine capability must keep its 422 through the screenshot route
// instead of being flattened into a 400, and DELETE /groups/:id must delegate
// to the engine (which leaves the group) rather than answer a hardcoded 500.
describe('Gated operations keep their engine status', () => {
  let app: Hono;
  const fakeSession: any = {
    getScreenshot: async () => {
      throw new UnprocessableEntityException('Can not get screenshot for non chrome based engine.');
    },
    deleteGroup: async (id: string) => ({ id, deleted: true }),
  };

  beforeAll(() => {
    container.registerInstance(
      AuditService,
      new AuditService(mkdtempSync(join(tmpdir(), 'bunwa-gated-audit-'))),
    );
    container.registerInstance(WhatsappConfigService, new WhatsappConfigService());
    container.registerInstance(SessionManager, {
      getWorkingSession: async () => fakeSession,
      getSession: () => fakeSession,
    } as any);

    app = new Hono();
    app.route('/', createApiRouter());
    app.onError(globalErrorHandler);
  });

  const fetchRoute = (path: string, method = 'GET'): Promise<Response> =>
    app.fetch(new Request(`http://localhost${path}`, { method, headers: { 'x-api-key': API_KEY } }));

  it('GET /api/:session/screenshot answers 422 naming the engine limitation', async () => {
    const res = await fetchRoute('/api/gated-session/screenshot');
    expect(res.status).toBe(422);
    const body: any = await res.json();
    expect(body.message).toContain('non chrome based engine');
    expect(body.message).not.toContain('Failed to take screenshot');
  });

  it('DELETE /api/:session/groups/:id delegates to the engine', async () => {
    const res = await fetchRoute('/api/gated-session/groups/120363427492440120@g.us', 'DELETE');
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.deleted).toBe(true);
  });

  it('DELETE /api/:session/groups/:id answers 422 when the engine lacks deleteGroup', async () => {
    const original = fakeSession.deleteGroup;
    fakeSession.deleteGroup = () => {
      throw new NotImplementedByEngineError('', 'NOWEB');
    };
    try {
      const res = await fetchRoute('/api/gated-session/groups/120363427492440120@g.us', 'DELETE');
      expect(res.status).toBe(422);
      const body: any = await res.json();
      expect(body.message).toContain("'NOWEB' engine");
    } finally {
      fakeSession.deleteGroup = original;
    }
  });
});
