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
import { WhatsappSessionNoWebCore } from '../core/engines/noweb/session.noweb.core';

// A client error from WhatsApp's newsletter directory (w:mex) must reach the
// caller as its own 4xx with the reason, not as an opaque 500. The directory
// answer arrives as a Boom error, which the shared error handler used to
// flatten into "Internal server error".
process.env.WAHA_API_KEY = 'channels-status-test-key';

const API_KEY = 'channels-status-test-key';

function makeSession(): WhatsappSessionNoWebCore {
  const session = new WhatsappSessionNoWebCore({
    name: 'channels-test',
    printQR: false,
    mediaManager: null as any,
    loggerBuilder: {
      child: () => ({
        info: () => {},
        debug: () => {},
        warn: () => {},
        error: () => {},
        trace: () => {},
      }),
    } as any,
    sessionStore: null as any,
    proxyConfig: undefined,
    sessionConfig: {},
    engineConfig: {},
    ignore: { status: false, groups: false, channels: false, broadcast: false },
  });
  session.store = {} as any;
  session.sock = { generateMessageTag: () => 'test-tag', query: async () => ({}) } as any;
  return session;
}

function graphqlError(statusCode: number, message: string) {
  return Object.assign(new Error(`GraphQL server error: ${message}`), {
    isBoom: true,
    output: { statusCode, payload: {} },
  });
}

describe('Channel directory client errors', () => {
  let app: Hono;
  let session: WhatsappSessionNoWebCore;

  beforeAll(() => {
    container.registerInstance(
      AuditService,
      new AuditService(mkdtempSync(join(tmpdir(), 'bunwa-channels-audit-'))),
    );
    container.registerInstance(WhatsappConfigService, new WhatsappConfigService());
    session = makeSession();
    container.registerInstance(SessionManager, {
      getWorkingSession: async () => session,
    } as any);

    app = new Hono();
    app.route('/', createApiRouter());
    app.onError(globalErrorHandler);
  });

  const post = (path: string, body: unknown): Promise<Response> =>
    app.fetch(
      new Request(`http://localhost${path}`, {
        method: 'POST',
        headers: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );

  it('POST /api/:session/channels/search/by-view answers the directory 400, not a 500', async () => {
    session.sock = {
      generateMessageTag: () => 'test-tag',
      query: async () => {
        throw graphqlError(400, 'Bad Request');
      },
    } as any;
    const res = await post('/api/channels-test/channels/search/by-view', {
      view: 'RECOMMENDED',
    });
    expect(res.status).toBe(400);
    const body: any = await res.json();
    expect(body.statusCode).toBe(400);
    expect(body.message).toContain('GraphQL server error: Bad Request');
  });

  it('POST /api/:session/channels/search/by-text inherits the same mapping', async () => {
    session.sock = {
      generateMessageTag: () => 'test-tag',
      query: async () => {
        throw graphqlError(403, 'Forbidden');
      },
    } as any;
    const res = await post('/api/channels-test/channels/search/by-text', {
      text: 'whatsapp',
    });
    expect(res.status).toBe(403);
    const body: any = await res.json();
    expect(body.message).toContain('GraphQL server error: Forbidden');
  });

  it('keeps a directory transport failure a generic 500', async () => {
    session.sock = {
      generateMessageTag: () => 'test-tag',
      query: async () => {
        throw new Error('socket closed');
      },
    } as any;
    const res = await post('/api/channels-test/channels/search/by-text', {
      text: 'whatsapp',
    });
    expect(res.status).toBe(500);
    const body: any = await res.json();
    expect(body.message).toBe('Internal server error');
  });
});


describe('Channel metadata refusals', () => {
  it('GET /api/:session/channels/:id answers 404 when WhatsApp refuses an unfollowed channel with 405', async () => {
    const app = new Hono();
    const session = makeSession();
    session.sock = {
      newsletterMetadata: async () => {
        throw Object.assign(new Error('GraphQL server error: Not Allowed'), {
          isBoom: true,
          output: { statusCode: 405, payload: {} },
        });
      },
    } as any;
    container.registerInstance(SessionManager, {
      getWorkingSession: async () => session,
    } as any);
    app.route('/', createApiRouter());
    app.onError(globalErrorHandler);

    const res = await app.fetch(
      new Request('http://localhost/api/channels-test/channels/120363000000000001@newsletter', {
        headers: { 'x-api-key': API_KEY },
      }),
    );
    expect(res.status).toBe(404);
    const body: any = await res.json();
    expect(body.message).toContain('120363000000000001@newsletter');
  });
});

const RESULT_NODE = (data: any) => ({
  tag: 'iq',
  attrs: {},
  content: [
    {
      tag: 'result',
      attrs: {},
      content: Buffer.from(JSON.stringify(data)),
    },
  ],
});

describe('Channel create and list', () => {
  let app: Hono;
  let session: WhatsappSessionNoWebCore;

  beforeAll(() => {
    session = makeSession();
    container.registerInstance(SessionManager, {
      getWorkingSession: async () => session,
    } as any);
    app = new Hono();
    app.route('/', createApiRouter());
    app.onError(globalErrorHandler);
  });

  const post = (path: string, body: unknown): Promise<Response> =>
    app.fetch(
      new Request(`http://localhost${path}`, {
        method: 'POST',
        headers: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );

  it('POST /api/:session/channels returns the channel when WhatsApp answers with picture null', async () => {
    let sent: any;
    session.sock = {
      generateMessageTag: () => 'test-tag',
      query: async (node: any) => {
        sent = {
          queryId: node.content[0].attrs.query_id,
          variables: JSON.parse(node.content[0].content.toString()).variables,
        };
        return RESULT_NODE({
          data: {
            xwa2_newsletter_create: {
              id: '120363000000000002@newsletter',
              state: { type: 'ACTIVE' },
              thread_metadata: {
                creation_time: '1791139000',
                description: { id: '1', text: 'drill', update_time: '1791139000' },
                handle: null,
                invite: '0029VaDrill0000000000000',
                name: { id: '2', text: 'BunWa Drill Channel', update_time: '1791139000' },
                picture: null,
                preview: null,
                subscribers_count: '0',
                verification: 'UNVERIFIED',
              },
              viewer_metadata: { mute: 'OFF', role: 'OWNER' },
            },
          },
        });
      },
    } as any;

    const res = await post('/api/channels-test/channels', {
      name: 'BunWa Drill Channel',
      description: 'Temporary drill channel.',
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.id).toBe('120363000000000002@newsletter');
    expect(body.name).toBe('BunWa Drill Channel');
    expect(sent.queryId).toBe('8823471724422422');
    expect(sent.variables.input).toEqual({
      name: 'BunWa Drill Channel',
      description: 'Temporary drill channel.',
    });
  });

  it('GET /api/:session/channels lists subscribed channels instead of a not-implemented error', async () => {
    session.sock = {
      generateMessageTag: () => 'test-tag',
      query: async (node: any) => {
        expect(node.content[0].attrs.query_id).toBe('6388546374527196');
        return RESULT_NODE({
          data: {
            xwa2_newsletter_subscribed: [
              {
                id: '120363000000000003@newsletter',
                state: { type: 'ACTIVE' },
                thread_metadata: {
                  creation_time: '1791139000',
                  description: { id: '1', text: '', update_time: '1791139000' },
                  handle: null,
                  invite: '0029VaSubscribed000000000',
                  name: { id: '2', text: 'Followed Channel', update_time: '1791139000' },
                  picture: null,
                  preview: null,
                  subscribers_count: '10',
                  verification: 'UNVERIFIED',
                },
                viewer_metadata: { mute: 'OFF', role: 'SUBSCRIBER' },
              },
            ],
          },
        });
      },
    } as any;

    const res = await app.fetch(
      new Request('http://localhost/api/channels-test/channels', {
        headers: { 'x-api-key': API_KEY },
      }),
    );
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('120363000000000003@newsletter');
    expect(body[0].role).toBe('SUBSCRIBER');
  });
});
