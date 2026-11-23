import { describe, it, expect } from 'bun:test';
import {
  formatPairingCode,
  mapWwebjsMessageType,
  splitProxyConfig,
  toGroupParticipant,
  toWebjsParticipantId,
} from '../core/engines/webjs/webjs.mappers';

describe('WEBJS mappers', () => {
  it('maps whatsapp-web.js message kinds onto the API vocabulary', () => {
    expect(mapWwebjsMessageType('chat')).toBe('text');
    expect(mapWwebjsMessageType('ptt')).toBe('audio');
    expect(mapWwebjsMessageType('contacts_vcard')).toBe('contact');
    expect(mapWwebjsMessageType('somethingNew')).toBe('unknown');
  });

  it('normalizes group participant entries and rejects malformed ones', () => {
    expect(toWebjsParticipantId('15551234567')).toBe('15551234567@c.us');
    expect(toWebjsParticipantId('15551234567@c.us')).toBe('15551234567@c.us');
    expect(toWebjsParticipantId({ id: '15551234567' })).toBe('15551234567@c.us');
    expect(() => toWebjsParticipantId({})).toThrow(/group participant/);
  });

  it('maps admin flags onto roles', () => {
    expect(toGroupParticipant({ id: { _serialized: '1@c.us' }, isSuperAdmin: true }).role)
      .toBe('superadmin');
    expect(toGroupParticipant({ id: { _serialized: '1@c.us' }, isAdmin: true }).role)
      .toBe('admin');
    expect(toGroupParticipant({ id: { _serialized: '1@c.us' } }).role).toBe('participant');
  });

  it('splits proxy credentials out of the server URL', () => {
    expect(splitProxyConfig({ server: 'http://proxy:8080' })).toEqual({
      server: 'http://proxy:8080/',
      authentication: undefined,
    });
    expect(splitProxyConfig({ server: 'http://user:pass@proxy:8080' })).toEqual({
      server: 'http://proxy:8080/',
      authentication: { username: 'user', password: 'pass' },
    });
    expect(
      splitProxyConfig({ server: 'http://proxy:8080', username: 'u', password: 'p' }),
    ).toEqual({
      server: 'http://proxy:8080/',
      authentication: { username: 'u', password: 'p' },
    });
    // Not a URL: passed through, no credentials guessed.
    expect(splitProxyConfig({ server: 'proxy:8080' })).toEqual({
      server: 'proxy:8080',
      authentication: undefined,
    });
  });

  it('presents pairing codes as ABCD-EFGH', () => {
    expect(formatPairingCode('ABCDEFGH')).toBe('ABCD-EFGH');
    expect(formatPairingCode('SHORT')).toBe('SHORT');
  });
});
