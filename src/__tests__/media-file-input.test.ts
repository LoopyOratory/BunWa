import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { messageTools } from '../mcp/tools/message.tools';
import type { SessionManager } from '../core/manager.core';

/**
 * The engine honours file.filename and file.mimetype, but the MCP tools typed
 * `file` as a string, so an agent could not name a document and the recipient
 * saw it called "file" — observed live when sending a PDF through the MCP.
 * The field now takes the object form as well, matching the REST contract.
 */
const manager = { getWorkingSession: async () => ({}) } as unknown as SessionManager;
const tools = messageTools(manager);
const tool = (name: string) => tools.find((t) => t.name === name)!;

describe('media file inputs', () => {
  it('accept a plain string', () => {
    for (const name of ['MessageSendFile', 'MessageSendImage', 'MessageSendVideo', 'MessageSendVoice']) {
      const parsed: any = tool(name).inputSchema.parse({
        sessionId: 's',
        chatId: 'c',
        file: 'https://example.com/a.pdf',
      });
      expect(parsed.file, name).toBe('https://example.com/a.pdf');
    }
  });

  it('accept an object carrying a filename and mimetype', () => {
    const parsed: any = tool('MessageSendFile').inputSchema.parse({
      sessionId: 's',
      chatId: 'c',
      file: { url: 'https://example.com/a.pdf', filename: 'order-summary.pdf', mimetype: 'application/pdf' },
    });
    expect(parsed.file).toEqual({
      url: 'https://example.com/a.pdf',
      filename: 'order-summary.pdf',
      mimetype: 'application/pdf',
    });
  });

  it('accept the data form too', () => {
    const parsed: any = tool('MessageSendImage').inputSchema.parse({
      sessionId: 's',
      chatId: 'c',
      file: { data: 'AAAA', mimetype: 'image/jpeg' },
    });
    expect(parsed.file).toEqual({ data: 'AAAA', mimetype: 'image/jpeg' });
  });

  it('still reject a missing file', () => {
    expect(() => tool('MessageSendFile').inputSchema.parse({ sessionId: 's', chatId: 'c' })).toThrow();
  });
});
