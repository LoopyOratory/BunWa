import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Hono } from 'hono';
import { createApiRouter } from '../api';

describe('API Key Authentication', () => {
  let app: Hono;

  beforeAll(() => {
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
