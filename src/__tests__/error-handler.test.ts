import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { Hono } from 'hono';
import { globalErrorHandler } from '../middleware/error-handler';
import {
  NotFoundException,
  ForbiddenException,
  TooManyRequestsException,
} from '../core/exceptions';

/**
 * The error handler is the last line of defence for leaking internals, and it
 * maps Bun's protocol-level rejections (oversized bodies) to clean 413s.
 */

function appThatThrows(err: unknown): Hono {
  const app = new Hono();
  app.onError(globalErrorHandler);
  app.get('/boom', () => {
    throw err;
  });
  return app;
}

describe('global error handler', () => {
  it('maps domain exceptions to their status codes', async () => {
    const notFound = await appThatThrows(new NotFoundException('Session x not found')).fetch(
      new Request('http://localhost/boom'),
    );
    expect(notFound.status).toBe(404);
    expect((await notFound.json()).message).toBe('Session x not found');

    const forbidden = await appThatThrows(new ForbiddenException('nope')).fetch(
      new Request('http://localhost/boom'),
    );
    expect(forbidden.status).toBe(403);
  });

  it('reports oversized bodies as 413 instead of a 500', async () => {
    const res = await appThatThrows(new Error('Request body exceeded maxRequestBodySize')).fetch(
      new Request('http://localhost/boom'),
    );
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.statusCode).toBe(413);
    expect(body.message).toContain('too large');
  });

  it('maps the sending policy block to 429 with Retry-After', async () => {
    const res = await appThatThrows(
      new TooManyRequestsException(42_500, 'Per minute send cap reached'),
    ).fetch(new Request('http://localhost/boom'));
    expect(res.status).toBe(429);
    // 42500ms rounds up to 43 seconds, in the header and the body
    expect(res.headers.get('Retry-After')).toBe('43');
    const body = await res.json();
    expect(body.statusCode).toBe(429);
    expect(body.retryAfterSeconds).toBe(43);
    expect(body.message).toContain('Per minute send cap reached');
    // Sentence case, no exclamation marks in the user-visible message
    expect(body.message).not.toMatch(/!/);
  });

  it('never exposes internal error details on unknown failures', async () => {
    const res = await appThatThrows(new Error('secret internal detail: db password xyz')).fetch(
      new Request('http://localhost/boom'),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('xyz');
  });
});
