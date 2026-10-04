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

// A group or channel id the NOWEB engine cannot resolve must reach the caller
// as a 404 naming the id, through the shared error handler; an operation the
// engine does not implement must reach it as a 422 carrying the engine's own
// message. None of these may turn into a 500.
process.env.WAHA_API_KEY = 'resource-not-found-test-key';

const API_KEY = 'resource-not-found-test-key';

/**
 * A real NOWEB session whose store has no groups and whose socket knows no
 * newsletters, the same state the live endpoint verifier hits for a
 * placeholder id. The methods under test live on the engine itself.
 */
function makeSession(): WhatsappSessionNoWebCore {
  const session = new WhatsappSessionNoWebCore({
    name: 'resource-test',
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
  session.store = {
    getGroupById: async () => null,
    getGroups: async () => ({}),
  } as any;
  session.sock = {
    generateMessageTag: () => 'test-tag',
    newsletterMetadata: async () => null,
    groupFetchAllParticipating: async () => ({}),
  } as any;
  return session;
}

describe('Missing resource and unimplemented operation status codes', () => {
  let app: Hono;
  let session: WhatsappSessionNoWebCore;

  beforeAll(() => {
    container.registerInstance(
      AuditService,
      new AuditService(mkdtempSync(join(tmpdir(), 'bunwa-resource-audit-'))),
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

  const get = (path: string): Promise<Response> =>
    app.fetch(new Request(`http://localhost${path}`, { headers: { 'x-api-key': API_KEY } }));

  it('GET /api/:session/groups/:id answers 404 naming the missing group', async () => {
    const res = await get('/api/resource-test/groups/missing-group');
    expect(res.status).toBe(404);
    const body: any = await res.json();
    expect(body.message).toContain('missing-group');
    expect(body.message).not.toContain('stack');
  });

  it('GET /api/:session/groups/:id/participants answers 404', async () => {
    const res = await get('/api/resource-test/groups/missing-group/participants');
    expect(res.status).toBe(404);
    const body: any = await res.json();
    expect(body.message).toContain('missing-group');
  });

  it('GET /api/:session/groups/:id/participants/v2 answers 404', async () => {
    const res = await get('/api/resource-test/groups/missing-group/participants/v2');
    expect(res.status).toBe(404);
    const body: any = await res.json();
    expect(body.message).toContain('missing-group');
  });

  it('GET /api/:session/groups/:id/settings/security/info-admin-only answers 404', async () => {
    const res = await get('/api/resource-test/groups/missing-group/settings/security/info-admin-only');
    expect(res.status).toBe(404);
    const body: any = await res.json();
    expect(body.message).toContain('missing-group');
  });

  it('GET /api/:session/groups/:id/settings/security/messages-admin-only answers 404', async () => {
    const res = await get('/api/resource-test/groups/missing-group/settings/security/messages-admin-only');
    expect(res.status).toBe(404);
    const body: any = await res.json();
    expect(body.message).toContain('missing-group');
  });

  it('GET /api/:session/channels/:id answers 404 naming the missing channel', async () => {
    const res = await get('/api/resource-test/channels/missing-channel');
    expect(res.status).toBe(404);
    const body: any = await res.json();
    expect(body.message).toContain('missing-channel');
    expect(body.message).not.toContain('stack');
  });

  it('maps a GraphQL Bad Request for an unresolvable channel id to 404', async () => {
    const sock = session.sock as any;
    const original = sock.newsletterMetadata;
    sock.newsletterMetadata = async () => {
      throw Object.assign(new Error('GraphQL server error: Bad Request'), {
        isBoom: true,
        output: { statusCode: 400, payload: {} },
      });
    };
    try {
      const res = await get('/api/resource-test/channels/unresolvable-channel');
      expect(res.status).toBe(404);
      const body: any = await res.json();
      expect(body.message).toContain('unresolvable-channel');
    } finally {
      sock.newsletterMetadata = original;
    }
  });

  it('leaves a channel transport failure as a 500, not a 404', async () => {
    const sock = session.sock as any;
    const original = sock.newsletterMetadata;
    sock.newsletterMetadata = async () => {
      throw new Error('socket closed');
    };
    try {
      const res = await get('/api/resource-test/channels/missing-channel');
      expect(res.status).toBe(500);
    } finally {
      sock.newsletterMetadata = original;
    }
  });

  it('GET /api/:session/channels/:id/messages/preview answers 422 with the reason', async () => {
    const res = await get('/api/resource-test/channels/missing-channel/messages/preview');
    expect(res.status).toBe(422);
    const body: any = await res.json();
    expect(body.message).toContain('Plus version');
    expect(body.statusCode).toBe(422);
  });

  it('GET /api/:session/channels lists subscribed channels instead of answering 422', async () => {
    const sock = session.sock as any;
    const original = sock.query;
    sock.query = async () => ({
      tag: 'iq',
      attrs: {},
      content: [
        {
          tag: 'result',
          attrs: {},
          content: Buffer.from(
            JSON.stringify({ data: { xwa2_newsletter_subscribed: [] } }),
          ),
        },
      ],
    });
    try {
      const res = await get('/api/resource-test/channels');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    } finally {
      sock.query = original;
    }
  });
});
