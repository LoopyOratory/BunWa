import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
process.env.WAHA_STORAGE_LOCAL_PATH = mkdtempSync(join(tmpdir(), 'bunwa-upl-tools-'));
process.env.WAHA_BASE_URL = 'https://wa.example.com';
import { uploadTools } from '../mcp/tools/upload.tools';
import { messageTools } from '../mcp/tools/message.tools';
import { buildAllTools } from '../mcp/tools';
import { uploadTickets } from '../core/uploads/upload-tickets';
import { UploadStore } from '../core/uploads/upload-store';

const sent: any[] = [];
const session = { name: 'vivita', sendFile: async (r: any) => { sent.push(r); return { id: 'm' }; } };
const manager: any = { getWorkingSession: async () => session };
const byName = (tools: any[], n: string) => tools.find((t) => t.name === n)!;

describe('MCP upload tools', () => {
  it('registers the three tools, session scoped', () => {
    const names = buildAllTools(manager).map((t) => t.name);
    for (const n of ['UploadCreateTicket', 'UploadList', 'UploadDelete']) expect(names).toContain(n);
    expect(uploadTools(manager).every((t) => t.sessionScoped)).toBe(true);
  });

  it('creates a ticket with a public URL and curl command', async () => {
    const out: any = await byName(uploadTools(manager), 'UploadCreateTicket').handler({ sessionId: 'vivita', filename: 'ads.zip' });
    expect(out.uploadUrl.startsWith('https://wa.example.com/uploads/')).toBe(true);
    expect(out.curl).toContain(out.uploadUrl);
    const token = new URL(out.uploadUrl).pathname.split('/').pop()!;
    expect(uploadTickets.consume(token)?.session).toBe('vivita');
  });

  it('MessageSendFile accepts upload:<id>', async () => {
    const rec = await new UploadStore().save('vivita', new Blob(['PK']), { filename: 'ads.zip', maxBytes: 10 });
    await byName(messageTools(manager), 'MessageSendFile').handler({ sessionId: 'vivita', chatId: 'x@c.us', file: `upload:${rec.id}` });
    expect(sent.at(-1).file.filename).toBe('ads.zip');
    expect(Buffer.isBuffer(sent.at(-1).file.data)).toBe(true);
  });

  it('lists and deletes', async () => {
    const tools = uploadTools(manager);
    const list: any = await byName(tools, 'UploadList').handler({ sessionId: 'vivita' });
    expect(list.length).toBeGreaterThan(0);
    const del: any = await byName(tools, 'UploadDelete').handler({ sessionId: 'vivita', uploadId: list[0].id });
    expect(del.deleted).toBe(true);
  });
});
