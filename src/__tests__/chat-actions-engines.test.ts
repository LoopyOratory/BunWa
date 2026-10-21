import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { EventEmitter } from 'node:events';
import pino from 'pino';
import { WhatsappSessionWebJs } from '../core/engines/webjs/session.webjs.core';
import { WhatsappSessionNoWebCore } from '../core/engines/noweb/session.noweb.core';
import { WAHAEvents, WAHASessionStatus } from '../structures/enums.dto';
import { CHANNEL_CATEGORIES, CHANNEL_VIEWS, channelCountries } from '../core/channels/directory';

const silent = { child: () => ({ info() {}, debug() {}, warn() {}, error() {}, trace() {} }) } as any;
const ignoreNothing = { status: false, groups: false, channels: false, broadcast: false };

function webjsSession() {
  const session = new WhatsappSessionWebJs({
    name: 'webjs-actions',
    printQR: false,
    mediaManager: null as any,
    loggerBuilder: silent,
    sessionStore: null as any,
    proxyConfig: undefined,
    sessionConfig: {},
    engineConfig: {},
    ignore: ignoreNothing,
  });
  const calls: Array<[string, ...any[]]> = [];
  const client: any = new EventEmitter();
  for (const method of ['muteChat', 'unmuteChat', 'archiveChat', 'unarchiveChat', 'markChatUnread']) {
    client[method] = async (...args: any[]) => {
      calls.push([method, ...args]);
      return { ok: true };
    };
  }
  (session as any).client = client;
  session.status = WAHASessionStatus.WORKING;
  return { session, client, calls };
}

describe('WEBJS live messages', () => {
  it('an incoming message reaches message and message.any, with fromMe', async () => {
    const { session, client } = webjsSession();
    (session as any).setupEventHandlers();
    const message: any[] = [];
    const any: any[] = [];
    session.getEventObservable(WAHAEvents.MESSAGE).subscribe((m: any) => message.push(m));
    session.getEventObservable(WAHAEvents.MESSAGE_ANY).subscribe((m: any) => any.push(m));
    client.emit('message', {
      id: { _serialized: 'false_233553919737@c.us_ABC', id: 'ABC' },
      from: '233553919737@c.us',
      to: 'me@c.us',
      body: 'hello',
      fromMe: false,
      type: 'chat',
      timestamp: 1,
      getContact: async () => null,
    });
    await Bun.sleep(5);
    expect(message).toHaveLength(1);
    expect(any).toHaveLength(1);
    expect(any[0].fromMe).toBe(false);
    expect(any[0]).not.toHaveProperty('isFromMe');
  });
});

describe('chat mute, unmute, archive and mark unread', () => {
  it('WEBJS calls whatsapp-web.js with a Date for a timed mute and none for always', async () => {
    const { session, calls } = webjsSession();
    const before = Date.now();
    await session.muteChat('233553919737', 3600);
    await session.muteChat('233553919737@c.us');
    await session.unmuteChat('233553919737@c.us');
    await session.chatsArchiveChat('233553919737@c.us');
    await session.chatsUnarchiveChat('233553919737@c.us');
    await session.chatsUnreadChat('233553919737@c.us');
    expect(calls[0][0]).toBe('muteChat');
    expect(calls[0][1]).toBe('233553919737@c.us');
    expect((calls[0][2] as Date).getTime()).toBeGreaterThanOrEqual(before + 3_600_000);
    expect(calls[1]).toEqual(['muteChat', '233553919737@c.us', undefined]);
    expect(calls.slice(2).map((c) => c[0])).toEqual(['unmuteChat', 'archiveChat', 'unarchiveChat', 'markChatUnread']);
  });

  it('NOWEB sends the mute end in ms, -1 for always, null to unmute', async () => {
    const session = new WhatsappSessionNoWebCore({
      name: 'noweb-actions',
      printQR: false,
      loggerBuilder: pino({ level: 'silent' }),
      sessionStore: {} as any,
      mediaManager: {} as any,
      engineConfig: {},
      sessionConfig: {},
      ignore: ignoreNothing,
    } as any) as any;
    const modifications: any[] = [];
    session.sock = { chatModify: async (mod: any, jid: string) => modifications.push([mod, jid]) };
    const before = Date.now();
    await session.muteChat('233553919737@c.us', 60);
    await session.muteChat('233553919737@c.us');
    await session.unmuteChat('233553919737@c.us');
    expect(modifications[0][1]).toBe('233553919737@s.whatsapp.net');
    expect(modifications[0][0].mute).toBeGreaterThanOrEqual(before + 60_000);
    expect(modifications[1][0]).toEqual({ mute: -1 });
    expect(modifications[2][0]).toEqual({ mute: null });
  });
});

describe('channel directory vocabularies', () => {
  it('lists views, categories and countries instead of []', () => {
    expect(CHANNEL_VIEWS.map((v) => v.value)).toContain('RECOMMENDED');
    expect(CHANNEL_CATEGORIES.length).toBeGreaterThan(0);
    const countries = channelCountries();
    expect(countries.length).toBeGreaterThan(200);
    expect(countries.find((c) => c.value === 'GH')?.name).toBe('Ghana');
  });
});
