import 'reflect-metadata';
import { describe, it, expect, afterAll } from 'bun:test';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { WhatsappSessionWebJs } from '../core/engines/webjs/session.webjs.core';
import { SendingPolicyService } from '../core/sending-policy/sending-policy.service';
import { TooManyRequestsException } from '../core/exceptions';

// The anti-ban sending policy used to be enforced only inside the NOWEB
// engine, so a session on WEBJS had no caps, quiet hours or reachout timelock.
// The gate now lives on the base session class; these tests pin that WEBJS
// sends go through it.

const ENV = {
  SEND_POLICY_ENABLED: 'true',
  SEND_MAX_PER_MINUTE: '2',
  SEND_MAX_PER_HOUR: '1000',
  SEND_MAX_PER_DAY: '1000',
  NEW_CHATS_PER_DAY: '1000',
  REACHOUT_MIN_INTERVAL_SECONDS: '0',
  SEND_WARMUP_FLOOR_PERCENT: '100',
  SEND_QUIET_HOURS: '',
};
const saved = new Map<string, string | undefined>();
for (const [key, value] of Object.entries(ENV)) {
  saved.set(key, process.env[key]);
  process.env[key] = value;
}

afterAll(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function makeSession() {
  const session = new WhatsappSessionWebJs({
    name: 'webjs-policy-test',
    printQR: false,
    mediaManager: null as any,
    loggerBuilder: {
      child: () => ({ info: () => {}, debug: () => {}, warn: () => {}, error: () => {} }),
    } as any,
    sessionStore: null as any,
    proxyConfig: undefined,
    sessionConfig: {},
    engineConfig: {},
    ignore: { status: false, groups: false, channels: false, broadcast: false },
  } as any);

  const sent: string[] = [];
  const s = session as any;
  s.ensureClientReady = () => {};
  s.wrapMessage = (msg: any) => msg;
  s.client = {
    sendMessage: async (chatId: string) => {
      sent.push(chatId);
      return { id: `m${sent.length}` };
    },
  };
  s.sendingPolicyService = new SendingPolicyService(
    mkdtempSync(join(tmpdir(), 'bunwa-policy-')),
    () => 1_700_000_000_000,
  );
  return { session, sent };
}

describe('WEBJS sends honour the sending policy', () => {
  it('refuses the send past the per-minute cap without calling WhatsApp', async () => {
    const { session, sent } = makeSession();

    await session.sendText({ chatId: '15550000001', text: 'one' } as any);
    await session.sendText({ chatId: '15550000001', text: 'two' } as any);

    let error: unknown;
    try {
      await session.sendText({ chatId: '15550000001', text: 'three' } as any);
    } catch (e) {
      error = e;
    }

    expect(error instanceof TooManyRequestsException).toBe(true);
    expect(sent).toHaveLength(2);
  });

  it('counts location sends against the same cap', async () => {
    const { session, sent } = makeSession();
    await session.sendText({ chatId: '15550000002', text: 'one' } as any);
    await session.sendLocation({ chatId: '15550000002', latitude: 1, longitude: 2, title: 'x' } as any);
    await expect(
      session.sendText({ chatId: '15550000002', text: 'three' } as any),
    ).rejects.toBeInstanceOf(TooManyRequestsException);
    expect(sent).toHaveLength(2);
  });
});
