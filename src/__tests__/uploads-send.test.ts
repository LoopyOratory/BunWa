import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { Hono } from 'hono';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { container } from 'tsyringe';
import { UploadStore } from '../core/uploads/upload-store';
import { SessionManager } from '../core/manager.core';
import { createChattingRouter } from '../api/chatting.routes';
import { AuditService } from '../core/audit/audit.service';
import { WhatsappConfigService } from '../config.service';
import { globalErrorHandler } from '../middleware/error-handler';

process.env.WAHA_API_KEY = 'uploads-send-test-key';
container.registerInstance(AuditService, new AuditService(mkdtempSync(join(tmpdir(), 'bunwa-upl-send-audit-'))));
container.registerInstance(WhatsappConfigService, new WhatsappConfigService());

const root = mkdtempSync(join(tmpdir(), 'bunwa-upl-send-'));
process.env.WAHA_STORAGE_LOCAL_PATH = root;
const store = new UploadStore(root);

const sent: any[] = [];
const fakeSession = {
  name: 'vivita',
  sendFile: async (req: any) => { sent.push(req); return { id: 'm1' }; },
  sendImage: async (req: any) => { sent.push(req); return { id: 'm2' }; },
};
container.registerInstance(SessionManager as any, {
  getWorkingSession: () => fakeSession,
  getSession: () => fakeSession,
} as any);

const app = new Hono();
app.onError(globalErrorHandler);
app.route('/api', createChattingRouter());

describe('sending an upload over REST', () => {
  it('sendFile turns upload:<id> into bytes with the stored name', async () => {
    const rec = await store.save('vivita', new Blob(['PK']), { filename: 'ads.zip', maxBytes: 10 });
    const res = await app.request('http://wa.test/api/sendFile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'uploads-send-test-key' },
      body: JSON.stringify({ session: 'vivita', chatId: '15551234567@c.us', file: `upload:${rec.id}` }),
    });
    expect(res.status).toBe(200);
    const req = sent.at(-1);
    expect(Buffer.isBuffer(req.file.data)).toBe(true);
    expect(req.file.filename).toBe('ads.zip');
    expect(req.file.mimetype).toBe('application/zip');
  });

  it('an unknown upload is a 422, not a 500', async () => {
    const res = await app.request('http://wa.test/api/sendImage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'uploads-send-test-key' },
      body: JSON.stringify({ session: 'vivita', chatId: '15551234567@c.us', file: 'upload:nope' }),
    });
    expect(res.status).toBe(422);
  });
});
