import { describe, it, expect } from 'bun:test';
import { evaluateFilters, type WebhookFilters } from '../common/security/webhook-filters';
import { buildLidResolver } from '../core/webhook-lid-resolver';

/**
 * The dashboard's webhook filters (Sender, Body contains, Group only, Sent by
 * me, Has media) against message payloads shaped the way the engines emit
 * them.
 */

const when = (...conditions: WebhookFilters['conditions']): WebhookFilters => ({ conditions });

// NOWEB: `from` is the chat; in a group the person is `participant`.
const dm = {
  from: '233553919737@c.us', to: '233200000000@c.us', fromMe: false,
  body: 'Is the Ankara dress in stock?', hasMedia: false, media: null,
};
const groupMessage = {
  from: '120363000000000000@g.us', to: '233200000000@c.us', participant: '233553919737@c.us',
  fromMe: false, body: 'hello group', hasMedia: false, media: null,
};
const sentToGroup = { from: '233200000000@c.us', to: '120363000000000000@g.us', fromMe: true, body: 'hi all', hasMedia: false, media: null };
const photo = { ...dm, body: 'look', hasMedia: true, media: null };
// WEBJS group message: the person is `author`.
const webjsGroup = { from: '120363000000000000@g.us', to: 'me@c.us', author: '233553919737@c.us', fromMe: false, body: 'x', hasMedia: false };

describe('webhook filters', () => {
  it('Sender matches one number, typed with + and spaces', () => {
    const f = when({ field: 'sender', operator: 'is', value: '+233 55 391 9737' });
    expect(evaluateFilters(f, 'message', dm)).toBe(true);
    expect(evaluateFilters(f, 'message', { ...dm, from: '233201111111@c.us' })).toBe(false);
  });

  it('Sender matches any of several comma-separated numbers (as the dashboard saves them)', () => {
    const f = when({ field: 'sender', operator: 'is', value: '233201111111, 233553919737,' });
    expect(evaluateFilters(f, 'message', dm)).toBe(true);
    expect(evaluateFilters(when({ field: 'sender', operator: 'is', value: ['233201111111', '233553919737'] }), 'message', dm)).toBe(true);
  });

  it('Sender matches the person in a group, not the group (NOWEB participant, WEBJS author)', () => {
    const f = when({ field: 'sender', operator: 'is', value: '233553919737' });
    expect(evaluateFilters(f, 'message', groupMessage)).toBe(true);
    expect(evaluateFilters(f, 'message', webjsGroup)).toBe(true);
  });

  it('Group only fires for group chats, incoming and sent', () => {
    const f = when({ field: 'isGroup', operator: 'is', value: true });
    expect(evaluateFilters(f, 'message', groupMessage)).toBe(true);
    expect(evaluateFilters(f, 'message', sentToGroup)).toBe(true);
    expect(evaluateFilters(f, 'message', dm)).toBe(false);
  });

  it('Sent by me', () => {
    const f = when({ field: 'fromMe', operator: 'is', value: true });
    expect(evaluateFilters(f, 'message.any', sentToGroup)).toBe(true);
    expect(evaluateFilters(f, 'message.any', dm)).toBe(false);
  });

  it('Has media uses hasMedia, even when the file was not downloaded', () => {
    const f = when({ field: 'hasMedia', operator: 'is', value: true });
    expect(evaluateFilters(f, 'message', photo)).toBe(true);
    expect(evaluateFilters(f, 'message', dm)).toBe(false);
  });

  it('Body contains is case-insensitive', () => {
    expect(evaluateFilters(when({ field: 'body', operator: 'contains', value: 'ANKARA' }), 'message', dm)).toBe(true);
    expect(evaluateFilters(when({ field: 'body', operator: 'contains', value: 'kente' }), 'message', dm)).toBe(false);
  });

  it('all conditions must match (AND)', () => {
    const f = when(
      { field: 'sender', operator: 'is', value: '233553919737' },
      { field: 'isGroup', operator: 'is', value: true },
    );
    expect(evaluateFilters(f, 'message', groupMessage)).toBe(true);
    expect(evaluateFilters(f, 'message', dm)).toBe(false);
  });

  it('non-message events are not filtered', () => {
    expect(evaluateFilters(when({ field: 'isGroup', operator: 'is', value: true }), 'session.status', { status: 'WORKING' })).toBe(true);
  });
});

describe('Sender filter and @lid addresses', () => {
  const f = when({ field: 'sender', operator: 'is', value: '233553919737' });
  const lidMessage = { from: '98765432109876@lid', to: 'me@c.us', fromMe: false, body: 'hi', hasMedia: false };

  it('without a resolver a LID does not match a phone number', () => {
    expect(evaluateFilters(f, 'message', lidMessage)).toBe(false);
  });

  it('uses the phone number the message key carries', async () => {
    const data = { ...lidMessage, _data: { key: { remoteJid: '98765432109876@lid', remoteJidAlt: '233553919737@s.whatsapp.net' } } };
    const resolve = await buildLidResolver(f, data);
    expect(evaluateFilters(f, 'message', data, resolve)).toBe(true);
  });

  it('falls back to the session LID store', async () => {
    const asked: string[] = [];
    const resolve = await buildLidResolver(f, lidMessage, async (lid) => {
      asked.push(lid);
      return { pn: '233553919737@c.us' };
    });
    expect(asked).toEqual(['98765432109876@lid']);
    expect(evaluateFilters(f, 'message', lidMessage, resolve)).toBe(true);
  });

  it('does no lookup when no filter compares senders', async () => {
    let called = false;
    const resolve = await buildLidResolver(when({ field: 'hasMedia', operator: 'is', value: true }), lidMessage, async () => {
      called = true;
      return { pn: null };
    });
    expect(resolve).toBeUndefined();
    expect(called).toBe(false);
  });
});
