import { Hono } from 'hono';
import { createApiRouter } from '../api';

export function createTestApp(): Hono {
  const app = new Hono();
  app.route('/', createApiRouter());
  return app;
}

export function mockSession(overrides = {}) {
  return {
    name: 'test-session',
    status: 'WORKING',
    me: { id: '123@c.us', pushName: 'Test' },
    config: {},
    ...overrides,
  };
}

export function createTestRequest(
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
  } = {}
): Request {
  const { method = 'GET', headers = {}, body } = options;
  
  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (body) {
    init.body = JSON.stringify(body);
  }

  return new Request(`http://localhost${path}`, init);
}
