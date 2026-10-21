import 'reflect-metadata';
import { describe, expect, it } from 'bun:test';
import pino from 'pino';
import { WhatsappSessionNoWebCore } from '../core/engines/noweb/session.noweb.core';
import { SessionManager } from '../core/manager.core';

const defaults = { status: false, groups: true, channels: false, broadcast: false };

function createSession(ignore: Record<string, boolean>) {
  return new WhatsappSessionNoWebCore({
    name: 'ignore-status-test',
    printQR: false,
    loggerBuilder: pino({ level: 'silent' }),
    sessionStore: {} as any,
    mediaManager: {} as any,
    engineConfig: {},
    sessionConfig: { ignore },
    ignore: defaults,
  } as any) as any;
}

describe('session ignore settings', () => {
  it('applies session status overrides while preserving other server defaults', () => {
    const session = createSession({ status: true });
    expect(session.jids.include('status@broadcast')).toBe(false);
    expect(session.jids.include('123@g.us')).toBe(false);
    expect(session.jids.include('123@s.whatsapp.net')).toBe(true);
  });

  it('allows explicit false to override a server default', () => {
    const session = createSession({ groups: false });
    expect(session.jids.include('123@g.us')).toBe(true);
  });

  it('updates a running session when its config is saved and restores defaults when removed', async () => {
    const session = createSession({});
    const manager: any = new SessionManager({ getIgnoreChatsConfig: () => defaults } as any);
    manager.sessions.set('ignore-status-test', session);
    manager.saveSessionIndex = async () => {};
    await manager.upsert('ignore-status-test', { ignore: { status: true } });
    expect(session.jids.include('status@broadcast')).toBe(false);
    expect(session.jids.include('123@s.whatsapp.net')).toBe(true);
    await manager.upsert('ignore-status-test', {});
    expect(session.jids.include('status@broadcast')).toBe(true);
    expect(session.jids.include('123@g.us')).toBe(false);
  });
});
