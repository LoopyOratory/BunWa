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

/**
 * Raw USync answers, shaped exactly as the live NOWEB session produced them:
 * a resolved handle names a LID and answers contact type "in"; an unregistered
 * handle has no jid and answers contact type "out"; an empty answer has a list
 * with no user node at all.
 */
function resolvedUsyncAnswer(handle: string, jid = '15551234567@lid') {
  return {
    tag: 'iq',
    attrs: { type: 'result' },
    content: [
      {
        tag: 'usync',
        attrs: {},
        content: [
          {
            tag: 'list',
            attrs: {},
            content: [
              {
                tag: 'user',
                attrs: { jid },
                content: [
                  { tag: 'username', attrs: { state: 'active' }, content: handle },
                  { tag: 'contact', attrs: { type: 'in', username: handle } },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function unregisteredUsyncAnswer(handle: string) {
  return {
    tag: 'iq',
    attrs: { type: 'result' },
    content: [
      {
        tag: 'usync',
        attrs: {},
        content: [
          {
            tag: 'list',
            attrs: {},
            content: [
              {
                tag: 'user',
                attrs: {},
                content: [{ tag: 'contact', attrs: { type: 'out', username: handle } }],
              },
            ],
          },
        ],
      },
    ],
  };
}

function emptyUsyncAnswer() {
  return {
    tag: 'iq',
    attrs: { type: 'result' },
    content: [{ tag: 'usync', attrs: {}, content: [{ tag: 'list', attrs: {}, content: [] }] }],
  };
}

/** A socket stub that records the USync IQ and answers with the given raw node. */
function socketAnswering(answer: unknown) {
  const calls: any[] = [];
  const sock = {
    query: async (node: any) => {
      calls.push(node);
      return answer;
    },
  };
  return { sock, calls };
}

/** A socket stub whose USync query rejects. */
function socketFailing(error: Error) {
  const calls: any[] = [];
  const sock = {
    query: async (node: any) => {
      calls.push(node);
      throw error;
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

  it('reports a handle with no connected socket as could not be checked', async () => {
    const session = makeSession();
    const error = await session.resolveSendTarget('@ada.lovelace').catch((e) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.message).toContain('could not be checked');
    expect(error.message).toContain('session is not connected');
    expect(error.message).toContain('numeric JID');
    expect(error.message).not.toContain('not registered');
  });

  it('resolves through the USync username and contact protocols, then caches', async () => {
    const session = makeSession();
    const { sock, calls } = socketAnswering(resolvedUsyncAnswer('ada.lovelace'));
    session.sock = sock as any;

    const resolved = await session.resolveSendTarget('@Ada.Lovelace');
    expect(resolved).toBe('15551234567@lid');
    expect(calls).toHaveLength(1);
    // The query asks for the username + contact protocols and carries the
    // lowercase handle on the contact element.
    const queryNode = calls[0].content[0].content[0];
    expect(queryNode.content.map((node: any) => node.tag)).toEqual(['contact', 'username']);
    const userNode = calls[0].content[0].content[1].content[0];
    expect(userNode.content).toEqual([
      { tag: 'contact', attrs: { username: 'ada.lovelace' } },
    ]);

    // The second call is served from the per-session cache.
    expect(await session.resolveSendTarget('ada.lovelace@username')).toBe('15551234567@lid');
    expect(calls).toHaveLength(1);
  });

  it('turns a definitive not registered answer into an accurate error', async () => {
    const session = makeSession();
    const { sock } = socketAnswering(unregisteredUsyncAnswer('ada.lovelace'));
    session.sock = sock as any;
    const error = await session.resolveSendTarget('@ada.lovelace').catch((e) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.message).toContain("username '@ada.lovelace' is not registered");
    expect(error.message).toContain('numeric JID');
  });

  it('does not call an empty answer not registered', async () => {
    const session = makeSession();
    const { sock } = socketAnswering(emptyUsyncAnswer());
    session.sock = sock as any;
    const error = await session.resolveSendTarget('@ada.lovelace').catch((e) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.message).toContain('could not be checked');
    expect(error.message).toContain('empty answer');
    expect(error.message).not.toContain('not registered');
  });

  it('does not call a lookup failure not registered', async () => {
    const session = makeSession();
    const { sock } = socketFailing(new Error('connection closed'));
    session.sock = sock as any;
    const error = await session.resolveSendTarget('@ada.lovelace').catch((e) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.message).toContain('could not be checked');
    expect(error.message).toContain('connection closed');
    expect(error.message).not.toContain('not registered');
  });
});

describe('NOWEB checkNumberStatus with a username', () => {
  it('reports a resolved handle as the LID, never as a phone number', async () => {
    const session = makeSession();
    const { sock, calls } = socketAnswering(
      resolvedUsyncAnswer('ada.lovelace', '111111111111114@lid'),
    );
    session.sock = sock as any;

    const result = await session.checkNumberStatus({ phone: '@Ada.Lovelace' });
    expect(result).toMatchObject({
      exists: true,
      isBusiness: false,
      canReceiveMessage: true,
      number: '111111111111114@lid',
      status: 'resolved',
      username: 'ada.lovelace',
      usernameState: 'active',
      lid: '111111111111114@lid',
    });
    // A username lookup must not fall through to the phone check at all.
    expect(calls).toHaveLength(1);
    expect((sock as any).onWhatsApp).toBeUndefined();
  });

  it('includes the locally stored display name for the LID when one is known', async () => {
    const session = makeSession();
    const { sock } = socketAnswering(resolvedUsyncAnswer('ada.lovelace', '111111111111114@lid'));
    session.sock = sock as any;
    session.store = {
      getContactById: async (jid: string) => {
        expect(jid).toBe('111111111111114@lid');
        return { id: jid, notify: 'Ada Lovelace' };
      },
    } as any;

    const result = await session.checkNumberStatus({ phone: '@ada.lovelace' });
    expect(result.status).toBe('resolved');
    expect(result.pushName).toBe('Ada Lovelace');
  });

  it('reports WhatsApp negative answer as not_resolvable', async () => {
    const session = makeSession();
    const { sock } = socketAnswering(unregisteredUsyncAnswer('ada.lovelace'));
    session.sock = sock as any;
    const result = await session.checkNumberStatus({ phone: '@ada.lovelace' });
    expect(result).toEqual({
      exists: false,
      isBusiness: false,
      canReceiveMessage: false,
      number: '@ada.lovelace',
      status: 'not_resolvable',
      username: 'ada.lovelace',
      reason: 'WhatsApp answered that this username is not registered.',
    });
  });

  it('reports an empty answer as could_not_check with exists null, not as absence', async () => {
    const session = makeSession();
    const { sock } = socketAnswering(emptyUsyncAnswer());
    session.sock = sock as any;
    const result = await session.checkNumberStatus({ phone: '@ada.lovelace' });
    expect(result.exists).toBeNull();
    expect(result.status).toBe('could_not_check');
    expect(result.reason).toContain('empty answer');
  });

  it('reports a lookup failure as could_not_check with exists null, not as absence', async () => {
    const session = makeSession();
    const { sock } = socketFailing(new Error('connection closed'));
    session.sock = sock as any;
    const result = await session.checkNumberStatus({ phone: '@ada.lovelace' });
    expect(result.exists).toBeNull();
    expect(result.status).toBe('could_not_check');
    expect(result.reason).toContain('connection closed');
  });

  it('reports a session that is not connected as could_not_check, not as absence', async () => {
    const session = makeSession();
    const result = await session.checkNumberStatus({ phone: '@ada.lovelace' });
    expect(result.exists).toBeNull();
    expect(result.status).toBe('could_not_check');
    expect(result.reason).toContain('session is not connected');
  });

  it('reports a jid without a contact answer as could_not_check, not as absence', async () => {
    const session = makeSession();
    const { sock } = socketAnswering({
      tag: 'iq',
      attrs: { type: 'result' },
      content: [
        {
          tag: 'usync',
          attrs: {},
          content: [
            {
              tag: 'list',
              attrs: {},
              content: [{ tag: 'user', attrs: { jid: '15551234567@lid' }, content: [] }],
            },
          ],
        },
      ],
    });
    session.sock = sock as any;
    const result = await session.checkNumberStatus({ phone: '@ada.lovelace' });
    expect(result.exists).toBeNull();
    expect(result.status).toBe('could_not_check');
  });

  it('rejects a malformed handle with a clear message', async () => {
    const session = makeSession();
    const error = await session.checkNumberStatus({ phone: '@a!' }).catch((e) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.message).toContain('not a valid WhatsApp username');
  });
});

describe('NOWEB checkNumberStatus with a phone number', () => {
  it('reports a known number as resolved', async () => {
    const session = makeSession();
    session.sock = {
      onWhatsApp: async () => [{ jid: '15551234567@s.whatsapp.net', exists: true }],
    } as any;
    const result = await session.checkNumberStatus({ phone: '15551234567' });
    expect(result).toMatchObject({
      exists: true,
      canReceiveMessage: true,
      number: '15551234567@c.us',
      status: 'resolved',
    });
  });

  it('reports an unknown number as not_resolvable', async () => {
    const session = makeSession();
    session.sock = { onWhatsApp: async () => [] } as any;
    const result = await session.checkNumberStatus({ phone: '15551234567' });
    expect(result).toMatchObject({ exists: false, status: 'not_resolvable' });
  });

  it('reports an empty onWhatsApp answer as could_not_check, not as absence', async () => {
    const session = makeSession();
    session.sock = { onWhatsApp: async () => undefined } as any;
    const result = await session.checkNumberStatus({ phone: '15551234567' });
    expect(result.exists).toBeNull();
    expect(result.status).toBe('could_not_check');
    expect(result.reason).toContain('did not answer');
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
