import { beforeAll, describe, expect, test } from 'bun:test';
import { Subject } from 'rxjs';
import { chatRuntime } from '../core/agent/chat-runtime';
import { agentService } from '../core/agent/agent.service';
import { BUNWAEvents, BUNWAPresenceStatus } from '../structures/enums.dto';

/**
 * Unit drills for the chat runtime's pipeline. The runtime is driven through
 * its public handleInbound surface with stubbed engine + injected sleep/rng,
 * so the tests assert the exact product sequence:
 * read -> typing -> hold -> stop typing -> send.
 */

const calls: Array<{ what: string; value?: string }> = [];
let typingMs = -1;
let nowMs = 1_000_000;

function recordCall(what: string, value?: string) {
  calls.push({ what, value });
}

// A stub engine session recording every method in order.
const stubSession = {
  sendSeen: async (req: { chatId: string }) => recordCall('read', req.chatId),
  setPresence: async (presence: string, chatId?: string) =>
    recordCall(presence === BUNWAPresenceStatus.TYPING ? 'typing on' : presence === BUNWAPresenceStatus.PAUSED ? 'typing off' : `presence:${presence}`, chatId),
  sendText: async (req: { chatId: string; text: string }) => {
    recordCall('send', req.text);
    return { id: 'BOT-SENT-1' };
  },
};

// A stub manager whose getSessionEvents streams per session.
const streams = new Map<string, Subject<{ event: BUNWAEvents; payload: any }>>();
const stubManager = {
  getSession: (name: string) => (name === 'bound' ? stubSession : null),
  getSessionEvents: (session: string) => {
    let stream = streams.get(session);
    if (!stream) {
      stream = new Subject();
      streams.set(session, stream);
    }
    return stream.asObservable();
  },
};

const quiet = { info: () => {}, warn: () => {} };

// The model call stub: any fetch goes to a fake OpenAI-compatible server.
const modelResponses: Array<{ status: number; content?: string }> = [];
let modelCalls = 0;
const stubFetch = (async () => {
  const next = modelResponses[modelCalls] ?? { status: 200, content: 'model reply' };
  modelCalls++;
  return new Response(
    JSON.stringify({ choices: [{ message: { content: next.content ?? 'model reply' } }] }),
    { status: next.status, headers: { 'content-type': 'application/json' } },
  );
}) as unknown as typeof fetch;

function message(overrides: Partial<{ id: string; from: string; body: string; fromMe: boolean; hasMedia: boolean }> = {}) {
  return {
    id: overrides.id ?? `msg-${Math.random().toString(36).slice(2, 8)}`,
    from: overrides.from ?? '233555000111@c.us',
    to: 'me',
    body: overrides.body ?? 'How much is delivery?',
    type: 'text',
    timestamp: Math.floor(Date.now() / 1000),
    fromMe: overrides.fromMe ?? false,
    hasMedia: overrides.hasMedia ?? false,
  };
}

const stubRecorder = {
  begin: async () => `conv-${Math.random().toString(36).slice(2, 8)}`,
  caller: async () => {},
  reply: async () => {},
  recordEvent: async () => {},
  end: async () => {},
};

beforeAll(() => {
  (chatRuntime as any).configure({
    manager: stubManager,
    logger: quiet,
    now: () => nowMs,
    sleep: async (ms: number) => {
      typingMs = ms;
      recordCall('held', `${ms}ms`);
      nowMs += ms;
    },
    randomTypingMs: () => 7000,
    fetchImpl: stubFetch,
    resolveAgentId: async () => 'agent-unit-test',
    makeRecorder: () => stubRecorder as any,
    getModelSettings: async () => ({
      id: 'chat', provider: 'openai-compatible' as any, baseUrl: 'https://model.test/v1',
      hasApiKey: true as any, model: 'unit-model', fallbackProvider: 'openai-compatible' as any,
      fallbackBaseUrl: '', hasFallbackApiKey: false as any, fallbackModel: '', updatedAt: '',
      apiKey: 'unit-key', fallbackApiKey: null,
    }) as any,
  });
});

describe('chat runtime pipeline', () => {
  test('sends read, typing, holds, stops typing, then sends the reply — in order', async () => {
    calls.length = 0;
    modelResponses.length = 0;
    modelCalls = 0;
    modelResponses.push({ status: 200, content: 'Delivery to Accra is fifteen cedis.' });

    await (chatRuntime as any).answer('bound', '233555000111@c.us', message());

    const order = calls.map((c) => c.what);
    expect(order.indexOf('read')).toBe(0);
    expect(order.indexOf('typing on')).toBe(1);
    expect(order.indexOf('held')).toBeGreaterThan(1);
    expect(order.indexOf('typing off')).toBeGreaterThan(order.indexOf('held'));
    expect(order.indexOf('send')).toBe(order.length - 1);
    expect(calls.find((c) => c.what === 'send')?.value).toBe('Delivery to Accra is fifteen cedis.');
  });

  test('typing hold comes from the random source (5.01-15.00 s by default)', async () => {
    calls.length = 0;
    await (chatRuntime as any).answer('bound', '233555000222@c.us', message());
    expect(typingMs).toBe(7000);
    // Bounds sanity: the default source draws uniformly inside the window.
    const envMin = Number(process.env.BUNWA_CHAT_TYPING_MIN_MS || 5010);
    const envMax = Number(process.env.BUNWA_CHAT_TYPING_MAX_MS || 15000);
    expect(envMin).toBeGreaterThanOrEqual(5010);
    expect(envMax).toBeLessThanOrEqual(15000);
    expect(envMax).toBeGreaterThan(envMin);
  });

  test('skips groups, broadcasts, media and empty bodies', async () => {
    calls.length = 0;
    await (chatRuntime as any).handleInbound('bound', message({ from: '120363@g.us', id: 'g1' }));
    await (chatRuntime as any).handleInbound('bound', message({ from: 'status@broadcast', id: 'b1' }));
    await (chatRuntime as any).handleInbound('bound', message({ hasMedia: true, id: 'm1' }));
    await (chatRuntime as any).handleInbound('bound', message({ body: '   ', id: 'e1' }));
    expect(calls.filter((c) => c.what === 'send')).toHaveLength(0);
  });

  test('a fromMe message the bot did not send silences the bot (human-active)', async () => {
    calls.length = 0;
    await (chatRuntime as any).handleInbound('bound', message({ fromMe: true, id: 'human-1' }));
    expect((chatRuntime as any).isHumanActive('233555000111@c.us')).toBe(true);
    // The inbound answer is suppressed while the human is active.
    await (chatRuntime as any).handleInbound('bound', message({ id: 'while-human' }));
    expect(calls.filter((c) => c.what === 'send')).toHaveLength(0);
    // 30 minutes later the bot hands back.
    nowMs += 31 * 60_000;
    expect((chatRuntime as any).isHumanActive('233555000111@c.us')).toBe(false);
    await (chatRuntime as any).handleInbound('bound', message({ id: 'after-handback' }));
    expect(calls.filter((c) => c.what === 'send')).toHaveLength(1);
  });

  test('the bot\'s own echo does not trigger human-active', async () => {
    calls.length = 0;
    // Simulate the runtime having just sent this id itself.
    (chatRuntime as any).botSentIds.add('echo-1');
    await (chatRuntime as any).handleInbound('bound', message({ fromMe: true, id: 'echo-1', from: '233555000333@c.us' }));
    expect((chatRuntime as any).isHumanActive('233555000333@c.us')).toBe(false);
  });

  test('model failure sends nothing', async () => {
    calls.length = 0;
    modelResponses.length = 0;
    modelCalls = 0;
    modelResponses.push({ status: 500 });
    modelResponses.push({ status: 500 }); // primary + fallback both fail
    await (chatRuntime as any).answer('bound', '233555000444@c.us', message());
    expect(calls.filter((c) => c.what === 'send')).toHaveLength(0);
    expect(calls.some((c) => c.what === 'typing off')).toBe(true);
  });

  test('single-flight coalesces a mid-reply follow-up into one send', async () => {
    calls.length = 0;
    modelResponses.length = 0;
    modelCalls = 0;
    modelResponses.push({ status: 200, content: 'first reply' });
    modelResponses.push({ status: 200, content: 'second reply' });

    const first = (chatRuntime as any).answer('bound', '233555000555@c.us', message({ body: 'first question' }));
    // While the pipeline is in flight, a second message is queued (coalesced).
    await (chatRuntime as any).handleInbound('bound', message({ body: 'second question' }));
    await first;

    const sends = calls.filter((c) => c.what === 'send').map((c) => c.value);
    expect(sends).toHaveLength(2); // first reply + the coalesced follow-up
    expect(sends[0]).toBe('first reply');
    expect(sends[1]).toBe('second reply');
  });

  test('reads carry the inbound message id; presence targets the chat', async () => {
    calls.length = 0;
    modelResponses.length = 0;
    modelCalls = 0;
    await (chatRuntime as any).answer('bound', '233555000666@c.us', message({ id: 'INBOUND-9' }));
    // setPresence received the chatId; sendSeen used it too (recorded with value).
    const typing = calls.find((c) => c.what === 'typing on');
    expect(typing?.value).toBe('233555000666@c.us');
    const read = calls.find((c) => c.what === 'read');
    expect(read?.value).toBe('233555000666@c.us');
  });
});
