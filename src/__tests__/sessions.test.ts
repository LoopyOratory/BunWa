import 'reflect-metadata';
import { describe, it, expect, beforeAll } from 'bun:test';
import { Hono } from 'hono';
import { container } from 'tsyringe';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createApiRouter } from '../api';
import { AuditService } from '../core/audit/audit.service';

// Set up API key so fail-closed middleware works in tests
process.env.WAHA_API_KEY = 'waha';

describe('Sessions API', () => {
  let app: Hono;

  beforeAll(() => {
    // manager.core.ts audits session create/delete through
    // container.resolve(AuditService). Its constructor takes a path/DB handle,
    // which tsyringe cannot inject ("TypeInfo not known for Object"), so the
    // instance must be registered explicitly or the request 500s.
    // Same fix as webhook-delivery.test.ts, bound to a temp dir so the test
    // never touches the real ./data/audit.db.
    container.registerInstance(
      AuditService,
      new AuditService(mkdtempSync(join(tmpdir(), 'bunwa-audit-'))),
    );

    app = new Hono();
    app.route('/', createApiRouter());
  });

  it('lists sessions with valid API key', async () => {
    const req = new Request('http://localhost/api/sessions', {
      headers: { 'x-api-key': 'waha' },
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it('creates a new session', async () => {
    const req = new Request('http://localhost/api/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'waha',
      },
      body: JSON.stringify({ name: 'test-session-123' }),
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe('test-session-123');
  });

  it('gets session by name', async () => {
    const req = new Request('http://localhost/api/sessions/test-session-123', {
      headers: { 'x-api-key': 'waha' },
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe('test-session-123');
  });

  it('deletes a session', async () => {
    const req = new Request('http://localhost/api/sessions/test-session-123', {
      method: 'DELETE',
      headers: { 'x-api-key': 'waha' },
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
  });
});
