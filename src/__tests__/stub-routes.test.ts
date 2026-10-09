import 'reflect-metadata';
import { describe, it, expect, beforeAll, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { container } from 'tsyringe';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createApiRouter } from '../api';
import { AuditService } from '../core/audit/audit.service';
import { SessionManager } from '../core/manager.core';
import { WhatsappConfigService } from '../config.service';
import { globalErrorHandler } from '../middleware/error-handler';
import { NotImplementedByEngineError } from '../core/exceptions';
import { WhatsappSessionNoWebCore } from '../core/engines/noweb/session.noweb.core';

// These routes used to answer success (or a fixed placeholder) without doing
// anything, so integrations believed a reply, vote, event, delete or
// conversion had happened. They now reach the engine, and an engine that
// cannot do the work answers 422 instead of pretending.
process.env.WAHA_API_KEY = 'stub-routes-test-key';
const API_KEY = 'stub-routes-test-key';

type Call = { method: string; args: any[] };

function makeFakeSession(calls: Call[], overrides: Record<string, any> = {}) {
  const record = (method: string, result: any) => async (...args: any[]) => {
    calls.push({ method, args });
    return typeof result === 'function' ? result(...args) : result;
  };
  return {
    name: 'stub-test',
    status: 'WORKING',
    sendButtonsReply: record('sendButtonsReply', { id: 'sent-reply' }),
    sendPollVote: record('sendPollVote', () => {
      throw new NotImplementedByEngineError('Voting in a poll is not supported by the NOWEB engine yet.');
    }),
    getChatsOverview: record('getChatsOverview', [
      { id: '15550000001@c.us', name: 'Alice', picture: null, lastMessage: null },
    ]),
    deleteChat: record('deleteChat', undefined),
    sendEvent: record('sendEvent', { id: 'sent-event' }),
    getContactProfilePicture: record('getContactProfilePicture', 'https://pps.example/group.jpg'),
    getContactAbout: record('getContactAbout', { about: 'Busy' }),
    mediaConverter: {
      voice: async () => Buffer.from(''),
      video: async (input: Buffer) => {
        calls.push({ method: 'video', args: [input] });
        return Buffer.from('mp4-bytes');
      },
    },
    ...overrides,
  };
}

describe('Formerly stubbed routes reach the engine', () => {
  let app: Hono;
  let calls: Call[];
  let session: any;

  beforeAll(() => {
    container.registerInstance(
      AuditService,
      new AuditService(mkdtempSync(join(tmpdir(), 'bunwa-stub-audit-'))),
    );
    container.registerInstance(WhatsappConfigService, new WhatsappConfigService());
    container.registerInstance(SessionManager, {
      getWorkingSession: async () => session,
    } as any);
    app = new Hono();
    app.route('/', createApiRouter());
    app.onError(globalErrorHandler);
  });

  beforeEach(() => {
    calls = [];
    session = makeFakeSession(calls);
  });

  const request = (method: string, path: string, body?: unknown): Promise<Response> =>
    app.fetch(
      new Request(`http://localhost${path}`, {
        method,
        headers: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );

  it('POST /api/send/buttons/reply sends the reply', async () => {
    const res = await request('POST', '/api/send/buttons/reply', {
      session: 'stub-test',
      chatId: '15550000001@c.us',
      selectedButtonID: 'yes',
      selectedDisplayText: 'Yes',
      replyTo: 'false_15550000001@c.us_ABC',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'sent-reply' });
    expect(calls[0].method).toBe('sendButtonsReply');
    expect(calls[0].args[0]).toMatchObject({
      chatId: '15550000001@c.us',
      selectedButtonID: 'yes',
      selectedDisplayText: 'Yes',
      replyTo: 'false_15550000001@c.us_ABC',
    });
  });

  it('POST /api/send/buttons/reply answers 400 without a button id', async () => {
    const res = await request('POST', '/api/send/buttons/reply', {
      session: 'stub-test',
      chatId: '15550000001@c.us',
    });
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('POST /api/sendPollVote answers 422 instead of claiming success', async () => {
    const res = await request('POST', '/api/sendPollVote', {
      session: 'stub-test',
      chatId: '15550000001@c.us',
      pollMessageId: 'true_15550000001@c.us_POLL',
      votes: ['Yes'],
    });
    expect(res.status).toBe(422);
    expect(calls[0].method).toBe('sendPollVote');
  });

  it('GET /api/:session/chats/:chatId returns the chat', async () => {
    const res = await request('GET', '/api/stub-test/chats/15550000001@c.us');
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe('Alice');
    expect(calls[0].args[1]).toEqual({ ids: ['15550000001@c.us'] });
  });

  it('GET /api/:session/chats/:chatId answers 404 for an unknown chat', async () => {
    session = makeFakeSession(calls, { getChatsOverview: async () => [] });
    const res = await request('GET', '/api/stub-test/chats/15559999999@c.us');
    expect(res.status).toBe(404);
  });

  it('GET /api/:session/chats/:chatId answers 404 when the store returns another chat', async () => {
    const res = await request('GET', '/api/stub-test/chats/15559999999@c.us');
    expect(res.status).toBe(404);
  });

  it('DELETE /api/:session/chats/:chatId deletes the chat', async () => {
    const res = await request('DELETE', '/api/stub-test/chats/15550000001@c.us');
    expect(res.status).toBe(200);
    expect(calls).toEqual([{ method: 'deleteChat', args: ['15550000001@c.us'] }]);
  });

  it('POST /api/:session/events sends the event', async () => {
    const event = { name: 'Launch', startTime: 1_800_000_000, endTime: 1_800_003_600 };
    const res = await request('POST', '/api/stub-test/events', { chatId: '15550000001@c.us', event });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'sent-event' });
    expect(calls[0].args[0]).toMatchObject({ chatId: '15550000001@c.us', event });
  });

  it('POST /api/:session/events validates the event', async () => {
    const missingStart = await request('POST', '/api/stub-test/events', {
      chatId: '15550000001@c.us',
      event: { name: 'Launch' },
    });
    expect(missingStart.status).toBe(400);
    const endBeforeStart = await request('POST', '/api/stub-test/events', {
      chatId: '15550000001@c.us',
      event: { name: 'Launch', startTime: 200, endTime: 100 },
    });
    expect(endBeforeStart.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('POST /api/:session/media/convert/video converts the file', async () => {
    const res = await request('POST', '/api/stub-test/media/convert/video', {
      file: Buffer.from('raw-video').toString('base64'),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mimetype).toBe('video/mp4');
    expect(Buffer.from(body.data, 'base64').toString()).toBe('mp4-bytes');
    expect(calls[0].args[0].toString()).toBe('raw-video');
  });

  it('GET /api/:session/groups/:id/picture reads the picture', async () => {
    const res = await request('GET', '/api/stub-test/groups/120363000000000001@g.us/picture?refresh=true');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://pps.example/group.jpg' });
    expect(calls[0].args).toEqual(['120363000000000001@g.us', true]);
  });

  it('GET /api/contacts/about reads the about text', async () => {
    const res = await request('GET', '/api/contacts/about?session=stub-test&contactId=15550000001@c.us');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ about: 'Busy' });
    expect(calls[0].args[0]).toEqual({ contactId: '15550000001@c.us' });
  });
});

describe('NOWEB engine: events and poll votes', () => {
  function makeNoweb() {
    const session = new WhatsappSessionNoWebCore({
      name: 'noweb-event-test',
      printQR: false,
      mediaManager: null as any,
      loggerBuilder: {
        child: () => ({ info: () => {}, debug: () => {}, warn: () => {}, error: () => {}, trace: () => {} }),
      } as any,
      sessionStore: null as any,
      proxyConfig: undefined,
      sessionConfig: {},
      engineConfig: {},
      ignore: { status: false, groups: false, channels: false, broadcast: false },
    });
    const sent: any[] = [];
    const s = session as any;
    s.sock = {
      sendMessage: async (jid: string, content: any) => {
        sent.push({ jid, content });
        return { key: { id: 'EVT' } };
      },
    };
    s.getMessageOptions = async () => ({});
    s.toWAMessage = (message: any) => message;
    return { session, sent };
  }

  it('sendEvent builds a Baileys event message from the WAHA request', async () => {
    const { session, sent } = makeNoweb();
    await session.sendEvent({
      chatId: '15550000001@c.us',
      event: {
        name: 'Launch',
        description: 'Ship it',
        startTime: 1_800_000_000,
        endTime: 1_800_003_600,
        location: { name: 'HQ' },
        extraGuestsAllowed: true,
      },
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].jid).toBe('15550000001@s.whatsapp.net');
    expect(sent[0].content.event).toEqual({
      name: 'Launch',
      description: 'Ship it',
      startDate: new Date(1_800_000_000_000),
      endDate: new Date(1_800_003_600_000),
      location: { name: 'HQ' },
      extraGuestsAllowed: true,
    });
  });

  it('sendPollVote refuses instead of sending an unencrypted vote', async () => {
    const { session, sent } = makeNoweb();
    await expect(
      session.sendPollVote({ chatId: '15550000001@c.us', pollMessageId: 'x', votes: ['Yes'] } as any),
    ).rejects.toBeInstanceOf(NotImplementedByEngineError);
    expect(sent).toHaveLength(0);
  });
});
