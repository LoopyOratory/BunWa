import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { mediaTools } from '../mcp/tools/media.tools';
import { messageTools } from '../mcp/tools/message.tools';
import { UnprocessableEntityException } from '../core/exceptions';
import type { SessionManager } from '../core/manager.core';
import type { ToolDescriptor } from '../mcp/tool-descriptor';

/**
 * Media MCP tools.
 *
 * The REST surface could download a message's media and serve a stored file,
 * and the MCP could neither, so an agent could send a picture but not read one
 * back. The download URL is served under /api and needs the API key, which is
 * why these return base64 an agent can pass straight to a send tool.
 */

const mediaRoot = mkdtempSync(join(tmpdir(), 'bunwa-media-'));
mkdirSync(join(mediaRoot, 'vivita'), { recursive: true });
writeFileSync(join(mediaRoot, 'vivita', 'file-ok.bin'), Buffer.from('hello media'));
writeFileSync(join(mediaRoot, 'vivita', 'file-big.bin'), Buffer.alloc(2048));
process.env.WAHA_STORAGE_LOCAL_PATH = mediaRoot;

const session = {
  getChatMessage: async (_chatId: string, messageId: string) => {
    if (messageId === 'no-media') return { id: messageId, media: null };
    return {
      id: messageId,
      type: 'image',
      body: 'a caption',
      media: {
        url: `http://localhost:3000/api/files/vivita/file-ok.bin`,
        mimetype: 'image/jpeg',
        filename: null,
      },
    };
  },
  mediaConverter: {
    voice: async (input: Buffer) => Buffer.concat([Buffer.from('OpusHead'), input]),
  },
};

const manager = {
  getWorkingSession: async () => session,
} as unknown as SessionManager;

const tools = mediaTools(manager);

function tool(name: string): ToolDescriptor {
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error(`tool ${name} missing`);
  return found;
}

async function call(name: string, input: unknown): Promise<any> {
  const descriptor = tool(name);
  return await descriptor.handler(descriptor.inputSchema.parse(input) as never);
}

describe('media MCP tools', () => {
  it('registers the download, file and convert tools', () => {
    expect(tools.map((t) => t.name).sort()).toEqual([
      'MediaConvertVoice',
      'MediaDownloadMessage',
      'MediaGetFile',
    ]);
    expect(tools.every((t) => t.category === 'media')).toBe(true);
    expect(tools.every((t) => t.sessionScoped === true)).toBe(true);
  });

  it('returns the message media as base64 with its mimetype', async () => {
    const result = await call('MediaDownloadMessage', {
      sessionId: 'vivita',
      chatId: '15551234567@c.us',
      messageId: 'true_15551234567@c.us_ABC',
    });
    expect(result.mimetype).toBe('image/jpeg');
    expect(result.base64).toBe(Buffer.from('hello media').toString('base64'));
    expect(result.sizeBytes).toBe(11);
    expect(result.caption).toBe('a caption');
    // the URL is returned for reference, but it needs the API key, which is why
    // the bytes come back too
    expect(result.url).toContain('/api/files/vivita/');
  });

  it('answers 422 when the message carries no media', async () => {
    await expect(
      call('MediaDownloadMessage', {
        sessionId: 'vivita',
        chatId: '15551234567@c.us',
        messageId: 'no-media',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('can return metadata only', async () => {
    const result = await call('MediaDownloadMessage', {
      sessionId: 'vivita',
      chatId: '15551234567@c.us',
      messageId: 'm1',
      includeData: false,
    });
    expect(result.base64).toBeUndefined();
    expect(result.mimetype).toBe('image/jpeg');
  });

  it('reads a stored file by name', async () => {
    const result = await call('MediaGetFile', { sessionId: 'vivita', filename: 'file-ok.bin' });
    expect(result.base64).toBe(Buffer.from('hello media').toString('base64'));
    expect(result.sizeBytes).toBe(11);
    expect(result.mimetype).toBe('application/octet-stream');
  });

  it('refuses a file above maxBytes instead of returning it', async () => {
    await expect(
      call('MediaGetFile', { sessionId: 'vivita', filename: 'file-big.bin', maxBytes: 100 }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('refuses a missing file and a traversal attempt', async () => {
    await expect(
      call('MediaGetFile', { sessionId: 'vivita', filename: 'nope.bin' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      call('MediaGetFile', { sessionId: 'vivita', filename: '../../etc/passwd' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('converts audio to OGG/Opus and returns base64', async () => {
    const result = await call('MediaConvertVoice', {
      sessionId: 'vivita',
      file: Buffer.from('not opus').toString('base64'),
    });
    expect(result.mimetype).toBe('audio/ogg; codecs=opus');
    expect(Buffer.from(result.base64, 'base64').subarray(0, 8).toString()).toBe('OpusHead');
  });
});

describe('send media tools', () => {
  const sendTools = messageTools(manager);

  it('document every accepted file shape', () => {
    for (const name of [
      'MessageSendImage',
      'MessageSendFile',
      'MessageSendVoice',
      'MessageSendVideo',
    ]) {
      const descriptor = sendTools.find((t) => t.name === name)!;
      expect(descriptor.description, name).toContain('http(s) URL');
      expect(descriptor.description, name).toContain('base64');
      expect(descriptor.description, name).toContain('local path');
      expect(descriptor.description, name).toContain('MediaDownloadMessage');
    }
  });
});
