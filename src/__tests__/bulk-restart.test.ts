import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Hono } from 'hono';
import { container } from 'tsyringe';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createBulkRouter } from '../api/chatting.routes';
import { AuditService } from '../core/audit/audit.service';
import { SessionManager } from '../core/manager.core';

/**
 * A bulk batch sends through the session that is running now: after a restart
 * the session object from the first request is a stopped instance.
 */
const API_KEY = 'bulk-restart-test-key';

function fakeSession(label: string, sent: string[]) {
  return {
    name: 'shop',
    sendText: async (request: any) => {
      sent.push(`${label}:${request.chatId}`);
      return { id: `${label}-${request.chatId}` };
    },
  };
}

describe('bulk sending across a session restart', () => {
  const sent: string[] = [];
  let current = fakeSession('first', sent);
  let previousManager: unknown;
  let savedKey: string | undefined;
  let app: Hono;

  beforeAll(() => {
    savedKey = process.env.WAHA_API_KEY;
    process.env.WAHA_API_KEY = API_KEY;
    if (!container.isRegistered(AuditService)) {
      container.registerInstance(AuditService, new AuditService(mkdtempSync(join(tmpdir(), 'bunwa-bulk-audit-'))));
    }
    previousManager = container.isRegistered(SessionManager) ? container.resolve(SessionManager) : undefined;
    container.registerInstance(SessionManager, { getWorkingSession: async () => current } as any);
    app = new Hono();
    app.route('/api', createBulkRouter());
  });

  afterAll(() => {
    if (previousManager) container.registerInstance(SessionManager, previousManager as SessionManager);
    if (savedKey === undefined) delete process.env.WAHA_API_KEY;
    else process.env.WAHA_API_KEY = savedKey;
  });

  const sendBulk = (chatId: string) =>
    app.request('/api/shop/messages/send-bulk', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({ recipients: [{ chatId }], content: { text: 'hi' }, delayMs: 0 }),
    });

  it('the second batch reaches the restarted session', async () => {
    expect((await sendBulk('a@c.us')).status).toBe(201);
    await Bun.sleep(20);
    current = fakeSession('second', sent);
    expect((await sendBulk('b@c.us')).status).toBe(201);
    await Bun.sleep(20);
    expect(sent).toEqual(['first:a@c.us', 'second:b@c.us']);
  });
});
