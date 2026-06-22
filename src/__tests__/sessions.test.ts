import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Hono } from 'hono';
import { createApiRouter } from '../api';

describe('Sessions API', () => {
  let app: Hono;

  beforeAll(() => {
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
