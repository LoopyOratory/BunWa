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

describe('API Key Authentication', () => {
  let app: Hono;

  beforeAll(() => {
    // The rejected-key path logs to the audit log through
    // container.resolve(AuditService). Its constructor takes a path/DB handle
    // that tsyringe cannot inject ("TypeInfo not known for Object"), so the
    // instance must be registered explicitly or the request 500s instead of
    // 401. Without this registration the file only passed when another test
    // file happened to register first (run-order luck); under
    // `bun test --parallel` — fresh globals per file — it failed every time.
    // Same fix as sessions.test.ts / webhook-delivery.test.ts.
    container.registerInstance(
      AuditService,
      new AuditService(mkdtempSync(join(tmpdir(), 'bunwa-audit-'))),
    );

    app = new Hono();
    app.route('/', createApiRouter());
  });

  it('rejects requests without API key', async () => {
    const req = new Request('http://localhost/api/sessions');
    const res = await app.fetch(req);
    expect(res.status).toBe(401);
  });

  it('rejects requests with invalid API key', async () => {
    const req = new Request('http://localhost/api/sessions', {
      headers: { 'x-api-key': 'wrong-key' },
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(401);
  });

  it('accepts requests with valid API key header', async () => {
    const req = new Request('http://localhost/api/sessions', {
      headers: { 'x-api-key': 'waha' },
    });
    const res = await app.fetch(req);
    // Should not be 401 (may be 200 or other success)
    expect(res.status).not.toBe(401);
  });
});
