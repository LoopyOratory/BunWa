import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Hono } from 'hono';
import { CryptoHasher } from 'bun';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { createMcpRouter } from '../mcp/mcp.server';
import type { SessionManager } from '../core/manager.core';

/**
 * End to end over the MCP HTTP endpoint, with a session-scoped key (the key
 * alone picks the session — no sessionId is sent):
 *  - a history page well past 4 KB comes back as one valid text result (it used
 *    to become an embedded resource the client rejected),
 *  - messages come back compact and with no wire secrets,
 *  - a send result has its media key and thumbnail stripped,
 *  - a reaction with the bare message ID reaches the engine untouched.
 */

const SESSION_KEY = 'sk_mcp_test_session_key';
const sessionKeyHash = new CryptoHasher('sha256').update(SESSION_KEY).digest('hex');

const calls: { method: string; args: any[] }[] = [];

function rawMessage(i: number) {
  return {
    id: `false_233553919737@c.us_MSG${i}`,
    timestamp: 1791700000 + i,
    from: '233553919737@c.us',
    fromMe: false,
    body: `Message ${i} ${'x'.repeat(200)}`,
    hasMedia: false,
    media: null,
    reactions: [],
    _data: {
      pushName: 'Ama',
      message: {
        imageMessage: { mediaKey: new Uint8Array(32), jpegThumbnail: Buffer.alloc(2000) },
      },
    },
  };
}

const workingSession = {
  getChatMessages: async (...args: any[]) => {
    calls.push({ method: 'getChatMessages', args });
    return Array.from({ length: 20 }, (_, i) => rawMessage(i));
  },
  sendImage: async (request: any) => {
    calls.push({ method: 'sendImage', args: [request] });
    return {
      key: { remoteJid: '233553919737@s.whatsapp.net', fromMe: true, id: '3EB0SENT' },
      message: {
        imageMessage: {
          mimetype: 'image/jpeg',
          caption: 'test',
          mediaKey: new Uint8Array(32),
          jpegThumbnail: Buffer.alloc(4000),
        },
      },
      status: 1,
    };
  },
  setReaction: async (request: any) => {
    calls.push({ method: 'setReaction', args: [request] });
  },
};

const fakeManager = {
  getSessions: async () => [{ name: 'Vivita' }],
  getSessionConfig: (name: string) =>
    name === 'Vivita' ? { mcp: { enabled: true, apiKeyHash: sessionKeyHash } } : undefined,
  getWorkingSession: async (name: string) => {
    if (name !== 'Vivita') throw new Error(`Session '${name}' is not running`);
    return workingSession;
  },
  getSession: (name: string) => workingSession,
} as unknown as SessionManager;

function parseSse(body: string): any[] {
  return body
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)));
}

describe('MCP results end to end (session-scoped key)', () => {
  let app: Hono;
  let savedKey: string | undefined;

  beforeAll(() => {
    savedKey = process.env.WAHA_API_KEY;
    process.env.WAHA_API_KEY = 'global-admin-key';
    app = new Hono();
    app.route('/', createMcpRouter(fakeManager));
  });

  afterAll(() => {
    if (savedKey === undefined) delete process.env.WAHA_API_KEY;
    else process.env.WAHA_API_KEY = savedKey;
  });

  async function callTool(name: string, args: object) {
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'Mcp-Protocol-Version': '2025-11-25',
        'X-Api-Key': SESSION_KEY,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    });
    expect(res.status).toBe(200);
    const [payload] = parseSse(await res.text());
    // Validate exactly as a strict client would.
    return CallToolResultSchema.parse(payload.result);
  }

  it('a 20-message history page is one valid text result, compact and secret-free', async () => {
    const result = await callTool('ChatGetMessages', { chatId: '233553919737@c.us', limit: 20 });
    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    const text = (result.content[0] as any).text as string;
    expect(text.length).toBeGreaterThan(4096);
    const messages = JSON.parse(text);
    expect(messages).toHaveLength(20);
    expect(messages[0]).toEqual({
      id: 'false_233553919737@c.us_MSG0',
      timestamp: 1791700000,
      from: '233553919737@c.us',
      fromMe: false,
      body: `Message 0 ${'x'.repeat(200)}`,
      hasMedia: false,
      pushName: 'Ama',
    });
    expect(text).not.toContain('mediaKey');
    // The key alone selected the session.
    expect(calls.find((c) => c.method === 'getChatMessages')).toBeDefined();
  });

  it('a send result keeps key.id but loses the media key and thumbnail', async () => {
    const result = await callTool('MessageSendImage', {
      chatId: '233553919737@c.us',
      file: 'https://vivita.store/p.jpg',
      caption: 'test',
    });
    const sent = JSON.parse((result.content[0] as any).text);
    expect(sent.key.id).toBe('3EB0SENT');
    expect(sent.message.imageMessage).toEqual({ mimetype: 'image/jpeg', caption: 'test' });
  });

  it('a reaction with the bare ID reaches the engine', async () => {
    const result = await callTool('MessageReact', {
      chatId: '233553919737@c.us',
      messageId: '3EB0SENT',
      reaction: '👍',
    });
    expect(result.isError).toBeUndefined();
    const reaction = calls.find((c) => c.method === 'setReaction')!;
    expect(reaction.args[0]).toMatchObject({ session: 'Vivita', messageId: '3EB0SENT', reaction: '👍' });
  });
});
