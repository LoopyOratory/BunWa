import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { container } from 'tsyringe';
import sharp from 'sharp';
import { WhatsappSessionNoWebCore, extractBody } from '../core/engines/noweb/session.noweb.core';
import { UnprocessableEntityException } from '../core/exceptions';
import { normalizePoll } from '../core/utils/poll';
import { redactWireSecrets } from '../core/utils/redact';
import {
  buildCustomLinkPreview,
  buildLinkPreview,
  clearLinkPreviewCache,
  decodeEntities,
  parsePageMetadata,
} from '../core/utils/link-preview';
import { MissingTemplateVariablesError, TemplateService } from '../core/templates/template.service';
import { smartToolResult } from '../mcp/tool-result';
import { compactMessage } from '../mcp/tools/message-format';
import { messageTools } from '../mcp/tools/message.tools';
import { chatTools } from '../mcp/tools/chat.tools';
import { templateTools } from '../mcp/tools/template.tools';
import type { SessionManager } from '../core/manager.core';
import type { ToolDescriptor } from '../mcp/tool-descriptor';

/**
 * Regression tests for the bugs a live MCP test run against a paired session
 * found (polls, history results, reactions on bare IDs, template placeholders,
 * link previews, interactive messages missing from history, wire secrets in
 * send results). Each block names the bug it pins.
 */

const quietLogger = {
  info: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {},
  trace: () => {},
  child() {
    return this;
  },
};

function makeSession(): WhatsappSessionNoWebCore {
  const session = new WhatsappSessionNoWebCore({
    name: 'findings-test',
    printQR: false,
    mediaManager: null as any,
    loggerBuilder: { child: () => quietLogger } as any,
    sessionStore: null as any,
    proxyConfig: undefined,
    sessionConfig: {},
    engineConfig: {},
    ignore: { status: false, groups: false, channels: false, broadcast: false },
  });
  // No sending policy: these tests are about what reaches the socket.
  (session as any).sendingPolicyService = null;
  return session;
}

/** A message store stub: only what the send paths read. */
function storeWith(messages: any[] = []) {
  return {
    loadMessage: async (jid: string, id: string) =>
      messages.find((m) => m.key.id === id && (!jid || m.key.remoteJid === jid)) ??
      messages.find((m) => m.key.id === id),
    getChat: async () => null,
  } as any;
}

/** A socket stub recording sendMessage / relayMessage calls and emitted events. */
function recordingSocket() {
  const sent: { jid: string; content: any; options: any }[] = [];
  const relayed: { jid: string; message: any; options: any }[] = [];
  const events: { name: string; data: any }[] = [];
  const sock: any = {
    user: { id: '233200000000:1@s.whatsapp.net' },
    sendMessage: async (jid: string, content: any, options: any) => {
      sent.push({ jid, content, options });
      return { key: { remoteJid: jid, fromMe: true, id: options?.messageId ?? 'SENT-1' }, message: {} };
    },
    relayMessage: async (jid: string, message: any, options: any) => {
      relayed.push({ jid, message, options });
      return options?.messageId;
    },
    ev: { emit: (name: string, data: any) => events.push({ name, data }) },
  };
  return { sock, sent, relayed, events };
}

function tool(tools: ToolDescriptor[], name: string): ToolDescriptor {
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error(`Tool ${name} not found`);
  return found;
}

async function call<T = any>(descriptor: ToolDescriptor, input: unknown): Promise<T> {
  const parsed = descriptor.inputSchema.parse(input);
  return (await descriptor.handler(parsed as never)) as T;
}

// ---------------------------------------------------------------------------
// Bug 1: polls always failed from MCP ("requires name and at least one option")
// ---------------------------------------------------------------------------
describe('polls accept both field vocabularies', () => {
  it('normalizes the REST shape { options, multipleAnswers }', () => {
    expect(normalizePoll({ name: 'Q?', options: ['A', 'B', 'C'], multipleAnswers: true })).toEqual({
      name: 'Q?',
      values: ['A', 'B', 'C'],
      selectableCount: 3,
    });
  });

  it('normalizes the MCP/Baileys shape { values, selectableCount }', () => {
    expect(normalizePoll({ name: 'Q?', values: ['A', 'B'], selectableCount: 1 })).toEqual({
      name: 'Q?',
      values: ['A', 'B'],
      selectableCount: 1,
    });
  });

  it('clamps selectableCount to the number of options and defaults to one', () => {
    expect(normalizePoll({ name: 'Q', values: ['A', 'B'], selectableCount: 9 }).selectableCount).toBe(2);
    expect(normalizePoll({ name: 'Q', options: ['A', 'B'] }).selectableCount).toBe(1);
  });

  it('accepts option objects and trims text', () => {
    expect(normalizePoll({ name: ' Q ', options: [{ name: ' A ' }, 'B'] }).values).toEqual(['A', 'B']);
  });

  it('rejects missing, duplicate and too many options with clear messages', () => {
    expect(() => normalizePoll({ name: 'Q' })).toThrow(UnprocessableEntityException);
    expect(() => normalizePoll({ options: ['A'] })).toThrow(/name/);
    expect(() => normalizePoll({ name: 'Q', options: ['A', 'A'] })).toThrow(/unique/);
    expect(() =>
      normalizePoll({ name: 'Q', options: Array.from({ length: 13 }, (_, i) => `o${i}`) }),
    ).toThrow(/at most 12/);
    expect(() => normalizePoll({ name: 'Q', values: ['A'], selectableCount: 0 })).toThrow(/selectableCount/);
  });

  it('the engine sends the MCP-shaped poll that used to fail', async () => {
    const session = makeSession();
    const { sock, sent } = recordingSocket();
    session.sock = sock;
    session.store = storeWith();
    await session.sendPoll({
      chatId: '233553919737@c.us',
      poll: { name: 'Favourite colour?', values: ['Red', 'Blue'], selectableCount: 1 },
    } as any);
    expect(sent).toHaveLength(1);
    expect(sent[0].content.poll).toMatchObject({
      name: 'Favourite colour?',
      values: ['Red', 'Blue'],
      selectableCount: 1,
    });
  });

  it('the MCP tool keeps options and values instead of stripping them', async () => {
    const received: any[] = [];
    const manager = {
      getWorkingSession: async () => ({ sendPoll: async (req: any) => received.push(req) }),
    } as unknown as SessionManager;
    const sendPoll = tool(messageTools(manager), 'MessageSendPoll');
    await call(sendPoll, {
      chatId: 'x@c.us',
      poll: { name: 'Q', options: ['A', 'B'], multipleAnswers: true },
    });
    await call(sendPoll, { chatId: 'x@c.us', poll: { name: 'Q', values: ['A', 'B'] } });
    expect(received[0].poll).toMatchObject({ options: ['A', 'B'], multipleAnswers: true });
    expect(received[1].poll).toMatchObject({ values: ['A', 'B'] });
    expect(() => sendPoll.inputSchema.parse({ chatId: 'x', poll: { name: 'Q' } })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Bug 3: MessageReact crashed on the bare message ID every send returns
// ---------------------------------------------------------------------------
describe('message actions accept the bare message ID', () => {
  it('reacts to a stored message by its bare ID, using the stored key', async () => {
    const session = makeSession();
    const { sock, sent } = recordingSocket();
    session.sock = sock;
    session.store = storeWith([
      { key: { remoteJid: '218734094458920@lid', fromMe: false, id: 'ABC123' }, message: {} },
    ]);
    await session.setReaction({ chatId: '233553919737@c.us', messageId: 'ABC123', reaction: '👍' } as any);
    expect(sent).toHaveLength(1);
    expect(sent[0].jid).toBe('218734094458920@lid');
    expect(sent[0].content.react).toEqual({
      text: '👍',
      key: { remoteJid: '218734094458920@lid', fromMe: false, id: 'ABC123', participant: undefined },
    });
  });

  it('builds the key from the chat when the message is not stored', async () => {
    const session = makeSession();
    const { sock, sent } = recordingSocket();
    session.sock = sock;
    session.store = storeWith();
    (session as any).saveSentMessageId('3EB0D63EFF9D902C423C5F');
    await session.setReaction({
      chatId: '233553919737@c.us',
      messageId: '3EB0D63EFF9D902C423C5F',
      reaction: '👍',
    } as any);
    expect(sent[0].jid).toBe('233553919737@s.whatsapp.net');
    expect(sent[0].content.react.key).toEqual({
      remoteJid: '233553919737@s.whatsapp.net',
      fromMe: true,
      id: '3EB0D63EFF9D902C423C5F',
    });
  });

  it('still accepts the full serialized ID', async () => {
    const session = makeSession();
    const { sock, sent } = recordingSocket();
    session.sock = sock;
    session.store = storeWith();
    await session.setReaction({
      chatId: '233553919737@c.us',
      messageId: 'false_233553919737@c.us_XYZ',
      reaction: '',
    } as any);
    expect(sent[0].content.react.key).toMatchObject({
      remoteJid: '233553919737@s.whatsapp.net',
      fromMe: false,
      id: 'XYZ',
    });
  });
});

// ---------------------------------------------------------------------------
// Bug 4: templates sent unfilled {{placeholders}}
// ---------------------------------------------------------------------------
describe('templates refuse to send with missing variables', () => {
  const svc = Object.create(TemplateService.prototype) as TemplateService;
  const template: any = {
    id: 't1',
    name: 'order-ready',
    header: 'Hi {{name}}',
    body: 'Order {{order}} is ready',
    footer: null,
  };

  it('lists the variables with no value (null and blank count as missing)', () => {
    expect(svc.missingVariables(template, { name: 'Ama' })).toEqual(['order']);
    expect(svc.missingVariables(template, { name: '  ', order: null })).toEqual(['name', 'order']);
    expect(svc.missingVariables(template, { name: 'Ama', order: 42 })).toEqual([]);
  });

  it('renderForSend throws naming the missing variables, unless allowed', () => {
    const error = (() => {
      try {
        svc.renderForSend(template, { name: 'Ama' });
      } catch (e) {
        return e as MissingTemplateVariablesError;
      }
    })();
    expect(error).toBeInstanceOf(MissingTemplateVariablesError);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error!.missingVariables).toEqual(['order']);
    expect(error!.message).toContain('order');
    expect(svc.renderForSend(template, { name: 'Ama' }, { allowMissing: true })).toBe(
      'Hi Ama\nOrder {{order}} is ready',
    );
    expect(svc.renderForSend(template, { name: 'Ama', order: 7 })).toBe('Hi Ama\nOrder 7 is ready');
  });

  it('TemplateSend refuses without sending; TemplatePreview reports what is missing', async () => {
    const sent: any[] = [];
    const fake = Object.assign(Object.create(TemplateService.prototype), {
      resolve: async () => template,
    });
    container.registerInstance(TemplateService, fake);
    const manager = {
      getWorkingSession: async () => ({ sendText: async (r: any) => sent.push(r) }),
    } as unknown as SessionManager;
    const tools = templateTools(manager);
    await expect(
      call(tool(tools, 'TemplateSend'), {
        sessionId: 's',
        chatId: 'x@c.us',
        template: 't1',
        variables: { name: 'Ama' },
      }),
    ).rejects.toBeInstanceOf(MissingTemplateVariablesError);
    expect(sent).toHaveLength(0);
    const preview = await call(tool(tools, 'TemplatePreview'), {
      sessionId: 's',
      template: 't1',
      variables: { name: 'Ama' },
    });
    expect(preview.missingVariables).toEqual(['order']);
    await call(tool(tools, 'TemplateSend'), {
      sessionId: 's',
      chatId: 'x@c.us',
      template: 't1',
      variables: { name: 'Ama' },
      allowMissingVariables: true,
    });
    expect(sent).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Bug 5: link previews were never generated
// ---------------------------------------------------------------------------
describe('link previews', () => {
  let server: ReturnType<typeof Bun.serve>;
  let base: string;
  let savedAllowed: string | undefined;

  beforeAll(async () => {
    const png = await sharp({
      create: { width: 64, height: 48, channels: 3, background: '#cc3300' },
    })
      .png()
      .toBuffer();
    server = Bun.serve({
      port: 0,
      fetch(req) {
        const path = new URL(req.url).pathname;
        if (path === '/product') {
          return new Response(
            `<html><head>
              <title>Fallback title</title>
              <meta property="og:title" content="Ankara Dress &amp; Wrap">
              <meta property="og:description" content="Size 10 &#8211; in stock">
              <meta property="og:image" content="/photo.png">
            </head><body>hello</body></html>`,
            { headers: { 'content-type': 'text/html; charset=utf-8' } },
          );
        }
        if (path === '/photo.png') {
          return new Response(png, { headers: { 'content-type': 'image/png' } });
        }
        if (path === '/endless') {
          // The head arrives at once; the body never finishes.
          const encoder = new TextEncoder();
          let sentHead = false;
          const stream = new ReadableStream({
            async pull(controller) {
              if (!sentHead) {
                sentHead = true;
                controller.enqueue(encoder.encode('<html><head><meta property="og:title" content="Big page"></head><body>'));
                return;
              }
              await Bun.sleep(100);
              controller.enqueue(encoder.encode('<p>more</p>'.repeat(50)));
            },
          });
          return new Response(stream, { headers: { 'content-type': 'text/html' } });
        }
        if (path === '/slow-image-page') {
          return new Response(
            '<html><head><meta property="og:title" content="Slow image"><meta property="og:image" content="/stall.png"></head></html>',
            { headers: { 'content-type': 'text/html' } },
          );
        }
        if (path === '/stall.png') {
          return Bun.sleep(5_000).then(() => new Response(png, { headers: { 'content-type': 'image/png' } }));
        }
        return new Response('missing', { status: 404 });
      },
    });
    base = `http://127.0.0.1:${server.port}`;
    savedAllowed = process.env.SSRF_ALLOWED_HOSTS;
    // The SSRF guard blocks loopback; allow this test server only.
    process.env.SSRF_ALLOWED_HOSTS = '127.0.0.1';
    clearLinkPreviewCache();
  });

  afterAll(() => {
    server.stop(true);
    if (savedAllowed === undefined) delete process.env.SSRF_ALLOWED_HOSTS;
    else process.env.SSRF_ALLOWED_HOSTS = savedAllowed;
  });

  it('parses Open Graph metadata, decoding entities and resolving the image URL', async () => {
    const meta = await parsePageMetadata(
      '<meta property="og:title" content="A &amp; B"><meta name="twitter:image" content="img/x.jpg"><title>T</title>',
      'https://shop.example/p/1',
    );
    expect(meta).toEqual({
      url: 'https://shop.example/p/1',
      title: 'A & B',
      description: undefined,
      image: 'https://shop.example/p/img/x.jpg',
    });
    expect(decodeEntities('&lt;b&gt; &#x2019; &#8211;')).toBe('<b> ’ –');
  });

  it('builds a card with title, description and a JPEG thumbnail', async () => {
    const info = await buildLinkPreview(`See ${base}/product today`);
    expect(info).not.toBeNull();
    expect(info!['matched-text']).toBe(`${base}/product`);
    expect(info!.title).toBe('Ankara Dress & Wrap');
    expect(info!.description).toBe('Size 10 – in stock');
    expect(info!.originalThumbnailUrl).toBe(`${base}/photo.png`);
    expect(Buffer.isBuffer(info!.jpegThumbnail)).toBe(true);
    // JPEG magic number
    expect(info!.jpegThumbnail!.subarray(0, 2).toString('hex')).toBe('ffd8');
  });

  it('stops reading a page at the end of <head>', async () => {
    const started = performance.now();
    const info = await buildLinkPreview(`${base}/endless`, { timeoutMs: 2_000 });
    expect(info?.title).toBe('Big page');
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it('keeps the card when only the image runs out of time', async () => {
    const info = await buildLinkPreview(`${base}/slow-image-page`, { timeoutMs: 500 });
    expect(info?.title).toBe('Slow image');
    expect(info?.originalThumbnailUrl).toBe(`${base}/stall.png`);
    expect(info?.jpegThumbnail).toBeUndefined();
  });

  it('answers null for text without a URL or an unreadable page', async () => {
    expect(await buildLinkPreview('no links here')).toBeNull();
    expect(await buildLinkPreview(`${base}/nothing`)).toBeNull();
  });

  it('sendText hands Baileys a built preview, not true/undefined', async () => {
    const session = makeSession();
    const { sock, sent } = recordingSocket();
    session.sock = sock;
    session.store = storeWith();
    await session.sendText({ chatId: '233553919737@c.us', text: `New in: ${base}/product` } as any);
    expect(sent[0].content.linkPreview.title).toBe('Ankara Dress & Wrap');
    await session.sendText({ chatId: '233553919737@c.us', text: 'plain text' } as any);
    expect(sent[1].content.linkPreview).toBeNull();
    await session.sendText({
      chatId: '233553919737@c.us',
      text: `${base}/product`,
      linkPreview: false,
    } as any);
    expect(sent[2].content.linkPreview).toBe(false);
  });

  it('sendLinkPreview falls back to a title card when the page cannot be read', async () => {
    const session = makeSession();
    const { sock, sent } = recordingSocket();
    session.sock = sock;
    session.store = storeWith();
    await session.sendLinkPreview({
      chatId: '233553919737@c.us',
      url: `${base}/nothing`,
      title: 'Our shop',
    } as any);
    const preview = sent[0].content.linkPreview;
    expect(preview).toMatchObject({ title: 'Our shop', 'matched-text': `${base}/nothing` });
    expect(preview).not.toBe(true);
  });

  it('a custom preview uses the caller title and puts the URL in the text', async () => {
    const info = await buildCustomLinkPreview('https://vivita.store/p/9', {
      url: 'https://vivita.store/p/9',
      title: 'Kente Bag',
      description: 'GH₵ 250',
    });
    expect(info).toMatchObject({
      'matched-text': 'https://vivita.store/p/9',
      title: 'Kente Bag',
      description: 'GH₵ 250',
    });
  });
});

// ---------------------------------------------------------------------------
// Bug 6: buttons and lists never reached chat history
// ---------------------------------------------------------------------------
describe('interactive messages are recorded like any other send', () => {
  it('sendList relays the message and emits messages.upsert (append)', async () => {
    const session = makeSession();
    const { sock, relayed, events } = recordingSocket();
    session.sock = sock;
    session.store = storeWith();
    const result: any = await session.sendList({
      chatId: '233553919737@c.us',
      title: 'Menu',
      description: 'Pick one',
      button: 'Open',
      sections: [{ title: 'S', rows: [{ rowId: 'r1', title: 'Row 1' }] }],
    } as any);
    expect(relayed).toHaveLength(1);
    await new Promise((resolve) => process.nextTick(resolve));
    const upsert = events.find((e) => e.name === 'messages.upsert');
    expect(upsert?.data.type).toBe('append');
    expect(upsert?.data.messages[0].key.id).toBe(result.key.id);
  });

  it('extractBody reads the visible text of an interactive message', () => {
    expect(
      extractBody({
        viewOnceMessageV2Extension: {
          message: {
            interactiveMessage: {
              header: { title: 'Menu' },
              body: { text: 'Pick one' },
              footer: { text: 'Thanks' },
            },
          },
        },
      }),
    ).toBe('Menu\nPick one\nThanks');
  });
});

// ---------------------------------------------------------------------------
// Bug 7: send results carried media keys, hashes and thumbnails
// ---------------------------------------------------------------------------
describe('wire secrets are stripped from results', () => {
  const raw = {
    key: { remoteJid: '1@s.whatsapp.net', fromMe: true, id: 'ID1' },
    message: {
      imageMessage: {
        url: 'https://mmg.whatsapp.net/x',
        mimetype: 'image/jpeg',
        caption: 'Photo',
        mediaKey: new Uint8Array([1, 2, 3]),
        fileSha256: Buffer.from('aa'),
        fileEncSha256: { type: 'Buffer', data: [1, 2] },
        jpegThumbnail: Buffer.alloc(900),
        fileLength: { low: 1234, high: 0, unsigned: true },
      },
      messageContextInfo: { messageSecret: new Uint8Array(32) },
    },
    messageTimestamp: 1791700000,
    pushName: 'Vivita',
  };

  it('removes secrets, keeps structure and does not mutate the input', () => {
    const clean: any = redactWireSecrets(raw);
    expect(clean.key.id).toBe('ID1');
    expect(clean.pushName).toBe('Vivita');
    expect(clean.message.imageMessage).toEqual({
      url: 'https://mmg.whatsapp.net/x',
      mimetype: 'image/jpeg',
      caption: 'Photo',
      fileLength: 1234,
    });
    expect(clean.message.messageContextInfo).toEqual({});
    expect(raw.message.imageMessage.mediaKey).toBeInstanceOf(Uint8Array);
  });

  it('summarizes stray binary and survives cycles', () => {
    const cyclic: any = { a: Buffer.alloc(10) };
    cyclic.self = cyclic;
    expect(redactWireSecrets(cyclic)).toEqual({ a: '<10 bytes>' });
  });
});

// ---------------------------------------------------------------------------
// Bug 2: history pages over a few messages broke the MCP client
// ---------------------------------------------------------------------------
describe('MCP results', () => {
  it('large results are plain text, never an embedded resource', () => {
    const big = Array.from({ length: 40 }, (_, i) => ({ id: i, body: 'x'.repeat(300) }));
    const result = smartToolResult(big);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(JSON.parse((result.content[0] as any).text)).toHaveLength(40);
    expect(result.isError).toBeUndefined();
  });

  it('answers a clear error past the size limit', () => {
    const saved = process.env.MCP_MAX_RESULT_BYTES;
    process.env.MCP_MAX_RESULT_BYTES = '100';
    try {
      const result = smartToolResult({ body: 'x'.repeat(500) });
      expect(result.isError).toBe(true);
      expect(JSON.parse((result.content[0] as any).text).name).toBe('ResultTooLarge');
    } finally {
      if (saved === undefined) delete process.env.MCP_MAX_RESULT_BYTES;
      else process.env.MCP_MAX_RESULT_BYTES = saved;
    }
  });

  it('compact messages drop _data but keep the sender name', () => {
    const message = {
      id: 'true_1@c.us_ID',
      body: 'hi',
      hasMedia: false,
      media: null,
      reactions: [],
      replyTo: { id: 'q', body: 'quoted', _data: { big: true } },
      _data: { pushName: 'Ama', message: { imageMessage: { mediaKey: new Uint8Array(4) } } },
    };
    expect(compactMessage(message)).toEqual({
      id: 'true_1@c.us_ID',
      body: 'hi',
      hasMedia: false,
      replyTo: { id: 'q', body: 'quoted' },
      pushName: 'Ama',
    });
    expect(compactMessage(message, true)._data).toEqual({
      pushName: 'Ama',
      message: { imageMessage: {} },
    });
  });

  it('ChatGetMessages returns compact messages', async () => {
    const manager = {
      getWorkingSession: async () => ({
        getChatMessages: async () => [{ id: 'a', body: 'x', _data: { pushName: 'P', huge: 'y'.repeat(5000) } }],
      }),
    } as unknown as SessionManager;
    const messages = await call(tool(chatTools(manager), 'ChatGetMessages'), { chatId: 'c@c.us' });
    expect(messages).toEqual([{ id: 'a', body: 'x', pushName: 'P' }]);
  });
});
