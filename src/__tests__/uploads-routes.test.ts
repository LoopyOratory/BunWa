import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { Hono } from 'hono';
import { container } from 'tsyringe';
import { AuditService } from '../core/audit/audit.service';
import { WhatsappConfigService } from '../config.service';
import { globalErrorHandler } from '../middleware/error-handler';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { UploadStore } from '../core/uploads/upload-store';
import { createUploadsRouter, createUploadTicketRouter, isUploadRoute } from '../api/uploads.routes';

process.env.WAHA_API_KEY = 'uploads-test-key';
const KEY = { 'X-Api-Key': 'uploads-test-key' };
container.registerInstance(AuditService, new AuditService(mkdtempSync(join(tmpdir(), 'bunwa-upl-audit-'))));
container.registerInstance(WhatsappConfigService, new WhatsappConfigService());

const store = new UploadStore(mkdtempSync(join(tmpdir(), 'bunwa-upl-routes-')));
const app = new Hono();
app.onError(globalErrorHandler);
app.route('/api', createUploadsRouter(store));
app.route('/uploads', createUploadTicketRouter(store));

async function ticket(body: object = {}) {
  const res = await app.request('http://wa.test/api/vivita/uploads/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...KEY },
    body: JSON.stringify(body),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as any;
}

describe('upload routes', () => {
  it('issues a ticket and accepts one PUT', async () => {
    const t = await ticket({ filename: 'ads.zip' });
    expect(t.curl).toContain(t.uploadUrl);
    const path = new URL(t.uploadUrl).pathname + new URL(t.uploadUrl).search;
    const put = await app.request(`http://wa.test${path}`, { method: 'PUT', body: 'PK-bytes' });
    expect(put.status).toBe(201);
    const rec = (await put.json()) as any;
    expect(rec.filename).toBe('ads.zip');
    expect(rec.mimetype).toBe('application/zip');
    expect(rec.size).toBe(8);
    const again = await app.request(`http://wa.test${path}`, { method: 'PUT', body: 'x' });
    expect(again.status).toBe(401);
  });

  it('rejects a body over the ticket limit with 413', async () => {
    const t = await ticket({ maxBytes: 4 });
    const path = new URL(t.uploadUrl).pathname;
    const put = await app.request(`http://wa.test${path}`, { method: 'PUT', body: '123456789' });
    expect(put.status).toBe(413);
    expect((await store.list('vivita')).every((r) => r.size !== 9)).toBe(true);
  });

  it('takes a filename from the X-Filename header', async () => {
    const t = await ticket();
    const put = await app.request(`http://wa.test${new URL(t.uploadUrl).pathname}`, {
      method: 'PUT',
      headers: { 'X-Filename': 'card.png' },
      body: 'png',
    });
    expect(((await put.json()) as any).mimetype).toBe('image/png');
  });

  it('accepts multipart, lists, reads and deletes', async () => {
    const form = new FormData();
    form.append('file', new File(['hello'], 'note.txt', { type: 'text/plain' }));
    const up = await app.request('http://wa.test/api/vivita/uploads', { method: 'POST', body: form, headers: KEY });
    expect(up.status).toBe(201);
    const rec = (await up.json()) as any;
    const list = (await (await app.request('http://wa.test/api/vivita/uploads', { headers: KEY })).json()) as any[];
    expect(list.some((r) => r.id === rec.id)).toBe(true);
    expect((await app.request(`http://wa.test/api/vivita/uploads/${rec.id}`, { headers: KEY })).status).toBe(200);
    expect((await app.request(`http://wa.test/api/vivita/uploads/${rec.id}`, { method: 'DELETE', headers: KEY })).status).toBe(200);
    expect((await app.request(`http://wa.test/api/vivita/uploads/${rec.id}`, { headers: KEY })).status).toBe(404);
  });

  it('recognises only the multipart route as an upload route', () => {
    expect(isUploadRoute('/api/vivita/uploads', 'POST')).toBe(true);
    expect(isUploadRoute('/api/vivita/uploads/tickets', 'POST')).toBe(false);
    expect(isUploadRoute('/api/sendFile', 'POST')).toBe(false);
  });
});
