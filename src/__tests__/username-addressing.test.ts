import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import {
  isUsernameAddress,
  isValidWhatsAppUsername,
  parseWaId,
  toNeutralJid,
  usernameHandle,
} from '../common/security/wa-id';
import { WhatsappSessionNoWebCore } from '../core/engines/noweb/session.noweb.core';
import { UnprocessableEntityException } from '../core/exceptions';

/**
 * WhatsApp username addressing: classification of the accepted spellings,
 * validation against Meta's published rules, and the NOWEB send-target
 * resolution (including the case where no address can be resolved).
 */

function makeSession(): WhatsappSessionNoWebCore {
  return new WhatsappSessionNoWebCore({
    name: 'username-test',
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

/** A socket stub that answers the USync username query with one resolved user. */
function resolvingSocket(jid = '15551234567@s.whatsapp.net') {
  const calls: any[] = [];
  const sock = {
    executeUSyncQuery: async (query: any) => {
      calls.push(query);
      return { list: [{ id: jid, contact: true, username: null }], sideList: [] };
    },
  };
  return { sock, calls };
}

describe('wa-id username classification', () => {
  it('classifies @handle, bare handle and handle@username', () => {
    expect(parseWaId('@Ada.Lovelace')).toMatchObject({ kind: 'username', userPart: 'ada.lovelace' });
    expect(parseWaId('ada.lovelace')).toMatchObject({ kind: 'username', userPart: 'ada.lovelace' });
    expect(parseWaId('Ada.Lovelace@username')).toMatchObject({
      kind: 'username',
      userPart: 'ada.lovelace',
    });
    expect(isUsernameAddress('@ada')).toBe(true);
  });

  it('keeps the existing JID kinds intact', () => {
    expect(parseWaId('15551234567@c.us').kind).toBe('user');
    expect(parseWaId('15551234567@s.whatsapp.net').kind).toBe('user');
    expect(parseWaId('1555:12@s.whatsapp.net')).toMatchObject({ kind: 'user', device: '12' });
    expect(parseWaId('123-456@g.us').kind).toBe('group');
    expect(parseWaId('123@lid').kind).toBe('lid');
    expect(parseWaId('status@broadcast').kind).toBe('status');
    expect(parseWaId('123@newsletter').kind).toBe('newsletter');
    expect(parseWaId('123@broadcast').kind).toBe('broadcast');
  });

  it('does not mistake a bare phone number for a username', () => {
    expect(parseWaId('15551234567').kind).toBe('unknown');
    expect(parseWaId('+15551234567').kind).toBe('unknown');
    expect(isUsernameAddress('15551234567')).toBe(false);
  });

  it('passes a username through toNeutralJid unchanged (no neutral JID exists)', () => {
    expect(toNeutralJid('@Ada.Lovelace')).toBe('@Ada.Lovelace');
    expect(toNeutralJid('ada@username')).toBe('ada@username');
    // phone and lid behavior is untouched
    expect(toNeutralJid('15551234567@s.whatsapp.net')).toBe('15551234567@c.us');
    expect(toNeutralJid('123:4@lid')).toBe('123@lid');
  });

  it('usernameHandle strips all three spellings but leaves other input alone', () => {
    expect(usernameHandle('@Ada.Lovelace')).toBe('ada.lovelace');
    expect(usernameHandle('Ada.Lovelace@username')).toBe('ada.lovelace');
    expect(usernameHandle('Ada.Lovelace')).toBe('ada.lovelace');
    expect(usernameHandle('15551234567@c.us')).toBe('15551234567@c.us');
  });

  it('validates against Meta published rules', () => {
    expect(isValidWhatsAppUsername('ada.lovelace')).toBe(true);
    expect(isValidWhatsAppUsername('@Ada_99')).toBe(true);
    expect(isValidWhatsAppUsername('abc')).toBe(true);

    expect(isValidWhatsAppUsername('ab')).toBe(false); // too short
    expect(isValidWhatsAppUsername('a'.repeat(36))).toBe(false); // too long
    expect(isValidWhatsAppUsername('12345')).toBe(false); // no letter
    expect(isValidWhatsAppUsername('ada lovelace')).toBe(false); // space
    expect(isValidWhatsAppUsername('.ada')).toBe(false); // leading period
    expect(isValidWhatsAppUsername('ada.')).toBe(false); // trailing period
    expect(isValidWhatsAppUsername('ada..lovelace')).toBe(false); // doubled period
    expect(isValidWhatsAppUsername('www.ada')).toBe(false); // www prefix
    expect(isValidWhatsAppUsername('ada.com')).toBe(false); // domain-like ending
  });
});

describe('NOWEB send-target resolution', () => {
  it('returns a non-username target unchanged', async () => {
    const session = makeSession();
    expect(await session.resolveSendTarget('15551234567@c.us')).toBe('15551234567@c.us');
    expect(await session.resolveSendTarget('15551234567')).toBe('15551234567');
    expect(await session.resolveSendTarget('123-456@g.us')).toBe('123-456@g.us');
  });

  it('rejects a malformed handle with a clear message', async () => {
    const session = makeSession();
    const error = await session.resolveSendTarget('ab').catch((e) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.message).toContain('not a valid WhatsApp username');
    expect(error.message).toContain('3 to 35 letters, digits, periods or underscores');
  });

  it('rejects a valid handle with no socket lookup available', async () => {
    const session = makeSession();
    const error = await session.resolveSendTarget('@ada.lovelace').catch((e) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.message).toContain("'@ada.lovelace' could not be resolved");
    expect(error.message).toContain('numeric JID');
  });

  it('resolves through the USync username and contact protocols, then caches', async () => {
    const session = makeSession();
    const { sock, calls } = resolvingSocket();
    session.sock = sock as any;

    const resolved = await session.resolveSendTarget('@Ada.Lovelace');
    expect(resolved).toBe('15551234567@s.whatsapp.net');
    expect(calls).toHaveLength(1);
    // The query carries the lowercase handle and asks for the username + contact protocols.
    expect(calls[0].users[0].username).toBe('ada.lovelace');
    const protocolNames = calls[0].protocols.map((p: any) => p.name);
    expect(protocolNames).toContain('username');
    expect(protocolNames).toContain('contact');

    // The second call is served from the per-session cache.
    expect(await session.resolveSendTarget('ada.lovelace@username')).toBe(
      '15551234567@s.whatsapp.net',
    );
    expect(calls).toHaveLength(1);
  });

  it('turns an empty lookup answer into the same clear error', async () => {
    const session = makeSession();
    session.sock = { executeUSyncQuery: async () => ({ list: [], sideList: [] }) } as any;
    const error = await session.resolveSendTarget('@ada.lovelace').catch((e) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.message).toContain('could not be resolved');
  });

  it('turns a lookup failure into the same clear error instead of a crash', async () => {
    const session = makeSession();
    session.sock = {
      executeUSyncQuery: async () => {
        throw new Error('connection closed');
      },
    } as any;
    const error = await session.resolveSendTarget('@ada.lovelace').catch((e) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.message).toContain('could not be resolved to an address on this account');
  });
});

describe('NOWEB checkNumberStatus with a username', () => {
  it('resolves and checks the resolved number', async () => {
    const session = makeSession();
    const { sock } = resolvingSocket();
    (sock as any).onWhatsApp = async (phone: string) => {
      expect(phone).toBe('15551234567');
      return [{ jid: '15551234567@s.whatsapp.net', exists: true }];
    };
    session.sock = sock as any;

    const result = await session.checkNumberStatus({ phone: '@ada.lovelace' });
    expect(result).toEqual({
      exists: true,
      isBusiness: false,
      canReceiveMessage: true,
      number: '15551234567@c.us',
    });
  });

  it('answers exists false when the handle resolves to nothing', async () => {
    const session = makeSession();
    session.sock = { executeUSyncQuery: async () => ({ list: [], sideList: [] }) } as any;
    const result = await session.checkNumberStatus({ phone: '@ada.lovelace' });
    expect(result).toEqual({
      exists: false,
      isBusiness: false,
      canReceiveMessage: false,
      number: '@ada.lovelace',
    });
  });

  it('rejects a username lookup when the session is not connected', async () => {
    const session = makeSession();
    const error = await session.checkNumberStatus({ phone: '@ada.lovelace' }).catch((e) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.message).toContain('session is not connected');
    expect(error.message).toContain('numeric JID');
  });

  it('rejects a malformed handle with a clear message', async () => {
    const session = makeSession();
    const error = await session.checkNumberStatus({ phone: '@a!' }).catch((e) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.message).toContain('not a valid WhatsApp username');
  });
});

describe('inbound username on WAMessage', () => {
  it('surfaces remoteJidUsername for a 1:1 message', () => {
    const session = makeSession();
    const wamessage = (session as any).toWAMessage({
      key: {
        id: 'AAA',
        remoteJid: '123@lid',
        fromMe: false,
        remoteJidUsername: 'ada.lovelace',
      },
      message: { conversation: 'hello' },
      messageTimestamp: 1,
    });
    expect(wamessage.username).toBe('ada.lovelace');
    expect(wamessage.from).toBe('123@lid');
    expect(wamessage.body).toBe('hello');
  });

  it('surfaces participantUsername for a group message', () => {
    const session = makeSession();
    const wamessage = (session as any).toWAMessage({
      key: {
        id: 'BBB',
        remoteJid: '123-456@g.us',
        participant: '999@lid',
        fromMe: false,
        participantUsername: 'ada.lovelace',
      },
      message: { conversation: 'hello group' },
      messageTimestamp: 1,
    });
    expect(wamessage.username).toBe('ada.lovelace');
    expect(wamessage.participant).toBe('999@lid');
  });

  it('is null when the message carries no handle', () => {
    const session = makeSession();
    const wamessage = (session as any).toWAMessage({
      key: { id: 'CCC', remoteJid: '1555@c.us', fromMe: false },
      message: { conversation: 'hello' },
      messageTimestamp: 1,
    });
    expect(wamessage.username).toBeNull();
  });
});
