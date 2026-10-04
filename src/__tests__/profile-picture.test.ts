import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { WhatsappSessionNoWebCore } from '../core/engines/noweb/session.noweb.core';

const CONTACT = '15550001111@c.us';
const LID = '111111111111111@lid';
const PICTURE_URL = 'https://pps.whatsapp.net/v/t61/test.jpg';

interface LookupCall {
  jid: string;
  type: string;
  timeoutMs: number | undefined;
}

/**
 * Builds a session with the real fetchContactProfilePicture from the prototype
 * and a stubbed socket, so timeout handling and the negative cache can be
 * exercised without a network connection.
 */
function createSession(
  impl?: (jid: string, type: string, timeoutMs?: number) => Promise<string | undefined>,
) {
  const calls: LookupCall[] = [];
  const session: any = Object.create(WhatsappSessionNoWebCore.prototype);
  session.sock = {
    profilePictureUrl: async (jid: string, type: string, timeoutMs?: number) => {
      calls.push({ jid, type, timeoutMs });
      if (impl) {
        return impl(jid, type, timeoutMs);
      }
      return PICTURE_URL;
    },
  };
  session.maintainPresenceOnline = async () => {};
  session.logger = {
    child: () => ({ info: () => {}, debug: () => {}, warn: () => {}, error: () => {} }),
  };
  return { session, calls };
}

/** A Boom-like error as Baileys query() rejects it on timeout. */
function timedOutError(): any {
  const error: any = new Error('Timed Out');
  error.output = { statusCode: 408 };
  return error;
}

describe('fetchContactProfilePicture', () => {
  it('returns the URL on success with an unchanged single lookup', async () => {
    const { session, calls } = createSession();
    const url = await session.fetchContactProfilePicture(CONTACT);
    expect(url).toBe(PICTURE_URL);
    expect(calls).toHaveLength(1);
    expect(calls[0].jid).toBe(CONTACT);
    expect(calls[0].type).toBe('image');
  });

  it('bounds the lookup with a short timeout', async () => {
    const { session, calls } = createSession();
    await session.fetchContactProfilePicture(CONTACT);
    expect(calls[0].timeoutMs).toBe(5000);
  });

  it('answers null for status@broadcast without sending a query', async () => {
    const { session, calls } = createSession();
    const url = await session.fetchContactProfilePicture('status@broadcast');
    expect(url).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('answers null for any broadcast id without sending a query', async () => {
    const { session, calls } = createSession();
    const url = await session.fetchContactProfilePicture('12345@broadcast');
    expect(url).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('turns a timed out lookup into null and caches the miss', async () => {
    const { session, calls } = createSession(async () => {
      throw timedOutError();
    });
    expect(await session.fetchContactProfilePicture(LID)).toBeNull();
    expect(calls).toHaveLength(1);

    // The second request for the same id answers from the negative cache
    // without touching the socket again.
    expect(await session.fetchContactProfilePicture(LID)).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('caches item-not-found and not-authorized answers as misses', async () => {
    for (const message of ['item-not-found', 'not-authorized']) {
      const { session, calls } = createSession(async () => {
        throw new Error(message);
      });
      expect(await session.fetchContactProfilePicture(CONTACT)).toBeNull();
      expect(await session.fetchContactProfilePicture(CONTACT)).toBeNull();
      expect(calls).toHaveLength(1);
    }
  });

  it('keeps the miss cache keyed per id', async () => {
    const { session, calls } = createSession(async (jid) => {
      if (jid === LID) {
        throw timedOutError();
      }
      return PICTURE_URL;
    });
    expect(await session.fetchContactProfilePicture(LID)).toBeNull();
    expect(await session.fetchContactProfilePicture(CONTACT)).toBe(PICTURE_URL);
    expect(calls).toHaveLength(2);
  });

  it('still surfaces unexpected errors and does not cache them', async () => {
    const failure = new Error('connection closed');
    const { session, calls } = createSession(async () => {
      throw failure;
    });
    expect(await session.fetchContactProfilePicture(CONTACT).catch((e: any) => e)).toBe(failure);
    expect(await session.fetchContactProfilePicture(CONTACT).catch((e: any) => e)).toBe(failure);
    expect(calls).toHaveLength(2);
  });
});
