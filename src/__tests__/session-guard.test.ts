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
