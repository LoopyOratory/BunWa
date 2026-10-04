import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { WhatsappSessionNoWebCore } from '../core/engines/noweb/session.noweb.core';

// A closed store keeps a destroyed storage handle: for Postgres that is a knex
// instance whose pool is gone, and every later query fails with "Unable to
// acquire a connection", which reaches clients as a 500. stop() and failed()
// used to close the store but keep the reference, so the next buildClient()
// (auto-restart, or a start after stop) reused it. These tests pin the
// close-and-drop contract that lets ensureStore() rebuild.
function makeSession(): WhatsappSessionNoWebCore {
  return new WhatsappSessionNoWebCore({
    name: 'store-lifecycle-test',
    printQR: false,
    mediaManager: null as any,
    loggerBuilder: {
      child: () => ({
        info: () => {},
        debug: () => {},
        warn: () => {},
        error: () => {},
        trace: () => {},
      }),
    } as any,
    sessionStore: null as any,
    proxyConfig: undefined,
    sessionConfig: {},
    engineConfig: {},
    ignore: { status: false, groups: false, channels: false, broadcast: false },
  });
}

function attachFakeStore(session: WhatsappSessionNoWebCore): { closed: boolean } {
  const state = { closed: false };
  (session as any).store = {
    close: async () => {
      state.closed = true;
    },
  };
  return state;
}

describe('NOWEB store lifecycle', () => {
  it('closeStore closes the handle and drops the reference', async () => {
    const session = makeSession();
    const state = attachFakeStore(session);

    await (session as any).closeStore();

    expect(state.closed).toBe(true);
    expect((session as any).store).toBeNull();
  });

  it('failed() drops the store so a restart rebuilds it', async () => {
    const session = makeSession();
    const state = attachFakeStore(session);
    (session as any).startDelayedJob = { cancel: () => {} };
    (session as any).autoRestartJob = { stop: () => {} };

    await (session as any).failed();

    expect(state.closed).toBe(true);
    expect((session as any).store).toBeNull();
    expect((session as any).status).toBe('FAILED');
  });

  it('stop() drops the store so a later start rebuilds it', async () => {
    const session = makeSession();
    const state = attachFakeStore(session);

    await (session as any).stop();

    expect(state.closed).toBe(true);
    expect((session as any).store).toBeNull();
  });
});
