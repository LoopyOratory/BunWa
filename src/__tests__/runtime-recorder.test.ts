import { describe, expect, test } from 'bun:test';
import { RuntimeRecorder } from '../core/agent/runtime-recorder';

interface CapturedCall {
  url: string;
  body: any;
}

function stubFetch(calls: CapturedCall[], respond: (url: string, body: any) => any = () => ({ ok: true, json: async () => ({ conversation: { id: 'conv-1' }, message: {}, event: {} }) })) {
  return (async (url: any, init: any) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ url: String(url), body });
    return respond(String(url), body);
  }) as unknown as typeof fetch;
}

const quiet = { info: () => {}, warn: () => {} };

describe('runtime recorder', () => {
  test('opens a conversation for the configured agent', async () => {
    const calls: CapturedCall[] = [];
    const recorder = new RuntimeRecorder({
      baseUrl: 'http://server:3001/',
      apiKey: 'key',
      agentId: 'agent-9',
      contact: '233555@c.us',
      fetchImpl: stubFetch(calls),
      logger: quiet as any,
    });
    const id = await recorder.begin({ kind: 'voice' });
    expect(id).toBe('conv-1');
    expect(calls[0].url).toBe('http://server:3001/api/agents/agent-9/conversations');
    expect(calls[0].body.userId).toBe('233555@c.us');
    expect(calls[0].body.channel).toBe('voice');
  });

  test('records a caller turn as an inbound message plus message.inbound event', async () => {
    const calls: CapturedCall[] = [];
    const recorder = new RuntimeRecorder({
      baseUrl: 'http://server:3001',
      apiKey: 'key',
      agentId: 'agent-9',
      fetchImpl: stubFetch(calls),
      logger: quiet as any,
    });
    await recorder.begin();
    await recorder.caller('How much is delivery to Accra?');

    const message = calls.find((c) => c.url.endsWith('/messages'))!;
    expect(message.body.role).toBe('customer');
    expect(message.body.text).toBe('How much is delivery to Accra?');

    const events = calls.filter((c) => c.url.endsWith('/api/agents/events'));
    expect(events.some((c) => c.body.type === 'message.inbound')).toBe(true);
    expect(events.every((c) => c.body.agentId === 'agent-9' && c.body.conversationId === 'conv-1')).toBe(true);
  });

  test('first reply carries firstResponseMs; later replies do not', async () => {
    const calls: CapturedCall[] = [];
    const recorder = new RuntimeRecorder({
      baseUrl: 'http://server:3001',
      apiKey: 'key',
      agentId: 'agent-9',
      fetchImpl: stubFetch(calls),
      logger: quiet as any,
    });
    await recorder.begin();
    await recorder.reply('Delivery to Accra is fifteen cedis.');
    await recorder.reply('Anything else?');

    const replies = calls.filter((c) => c.body.type === 'agent.reply');
    expect(replies).toHaveLength(2);
    expect(typeof replies[0].body.data.firstResponseMs).toBe('number');
    expect(replies[1].body.data.firstResponseMs).toBeUndefined();

    const firstMessage = calls.find((c) => c.url.endsWith('/messages') && c.body.role === 'agent')!;
    expect(typeof firstMessage.body.metadata.firstResponseMs).toBe('number');
  });

  test('closes the conversation on end()', async () => {
    const calls: CapturedCall[] = [];
    const recorder = new RuntimeRecorder({
      baseUrl: 'http://server:3001',
      apiKey: 'key',
      agentId: 'agent-9',
      fetchImpl: stubFetch(calls),
      logger: quiet as any,
    });
    await recorder.begin();
    await recorder.end({ outcome: 'resolved' });
    expect(calls.some((c) => c.url.endsWith('/api/agents/conversations/conv-1/close'))).toBe(true);
    expect(recorder.active).toBe(false);
  });

  test('without agent config, everything is a no-op (never breaks the call)', async () => {
    const calls: CapturedCall[] = [];
    const recorder = new RuntimeRecorder({
      baseUrl: 'http://server:3001',
      apiKey: '',
      agentId: '',
      fetchImpl: stubFetch(calls),
      logger: quiet as any,
    });
    expect(await recorder.begin()).toBeNull();
    await recorder.caller('hello');
    await recorder.reply('hi');
    await recorder.end();
    expect(calls).toHaveLength(0);
  });

  test('a failing dashboard write logs and never throws into the audio path', async () => {
    const warnings: string[] = [];
    const recorder = new RuntimeRecorder({
      baseUrl: 'http://server:3001',
      apiKey: 'key',
      agentId: 'agent-9',
      fetchImpl: (async () => {
        throw new Error('dashboard down');
      }) as unknown as typeof fetch,
      logger: { info: () => {}, warn: (m: string) => warnings.push(m) } as any,
    });
    await expect(recorder.begin()).resolves.toBeNull();
    // begin() failed -> no conversation -> turns are silent no-ops (the
    // dashboard being down at open time must not spam the audio path).
    await expect(recorder.caller('hello')).resolves.toBeUndefined();
    await expect(recorder.reply('hi')).resolves.toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('runtime recorder');
    expect(warnings[0]).toContain('begin failed');
  });
});
