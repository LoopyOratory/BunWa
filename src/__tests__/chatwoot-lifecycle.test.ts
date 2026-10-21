import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { Subject } from 'rxjs';
import { ChatwootAppService } from '../apps/chatwoot/services/ChatwootAppService';
import { WAHAEvents } from '../structures/enums.dto';

/**
 * Chatwoot follows the session's life: an app added after boot, a session
 * that starts after boot, and a restart all end up subscribed to the live
 * session object, and a removed or disabled app is unsubscribed.
 */

class MemoryRepository {
  apps = new Map<string, any>();
  async init() {}
  async findAll() { return [...this.apps.values()]; }
  async findById(id: string) { return this.apps.get(id) ?? null; }
  async findBySession(session: string) { return [...this.apps.values()].find((a) => a.session === session && a.enabled) ?? null; }
  async findAllEnabled() { return [...this.apps.values()].filter((a) => a.enabled); }
  async save(app: any) { this.apps.set(app.id, app); }
  async delete(id: string) { return this.apps.delete(id); }
}

function fakeSession() {
  const messages = new Subject<any>();
  return {
    messages,
    getEventObservable(event: WAHAEvents) {
      if (event !== WAHAEvents.MESSAGE_ANY) throw new Error('unexpected event');
      return messages;
    },
  };
}

function setup() {
  const running = new Map<string, ReturnType<typeof fakeSession>>();
  const sessionStarted$ = new Subject<{ name: string; session: any }>();
  const manager = { sessionStarted$, getRunningSession: (name: string) => running.get(name) } as any;
  const service = new ChatwootAppService();
  (service as any).repository = new MemoryRepository();
  const handled: string[] = [];
  (service as any).handleIncomingMessage = async (session: string, data: any) => {
    handled.push(`${session}:${data.body}`);
  };
  const start = (name: string) => {
    const session = fakeSession();
    running.set(name, session);
    sessionStarted$.next({ name, session });
    return session;
  };
  return { service, manager, running, start, handled };
}

const app = (session: string, enabled = true) => ({
  session,
  app: 'chatwoot' as const,
  enabled,
  config: { url: 'http://chatwoot.test', accountId: 1, accountToken: 't', inboxId: 1 } as any,
});

const flush = () => Bun.sleep(5);

describe('Chatwoot subscriptions follow the session lifecycle', () => {
  it('subscribes when the session starts after boot', async () => {
    const { service, manager, start, handled } = setup();
    await service.createApp(app('shop'));
    await service.init(manager);
    const session = start('shop');
    await flush();
    session.messages.next({ body: 'hello' });
    await flush();
    expect(handled).toEqual(['shop:hello']);
  });

  it('subscribes an app added while the session is already running', async () => {
    const { service, manager, start, handled } = setup();
    await service.init(manager);
    const session = start('shop');
    await service.createApp(app('shop'));
    session.messages.next({ body: 'late app' });
    await flush();
    expect(handled).toEqual(['shop:late app']);
  });

  it('moves to the new session object on restart and leaves the old one', async () => {
    const { service, manager, start, handled } = setup();
    await service.createApp(app('shop'));
    await service.init(manager);
    const first = start('shop');
    await flush();
    const second = start('shop');
    await flush();
    first.messages.next({ body: 'old' });
    second.messages.next({ body: 'new' });
    await flush();
    expect(handled).toEqual(['shop:new']);
    expect(first.messages.observed).toBe(false);
  });

  it('unsubscribes when the app is disabled or deleted', async () => {
    const { service, manager, start, handled } = setup();
    const created = await service.createApp(app('shop'));
    await service.init(manager);
    const session = start('shop');
    await flush();
    await service.updateApp(created.id, { enabled: false });
    session.messages.next({ body: 'ignored' });
    await service.updateApp(created.id, { enabled: true });
    session.messages.next({ body: 'back' });
    await service.deleteApp(created.id);
    session.messages.next({ body: 'gone' });
    await flush();
    expect(handled).toEqual(['shop:back']);
    expect(session.messages.observed).toBe(false);
  });
});
