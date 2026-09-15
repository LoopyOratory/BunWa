import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { createHmac, createHash } from 'crypto';
import {
  generateWebhookSignature,
  verifyWebhookSignature,
  generateIdempotencyKey,
} from '../common/security/webhook-signing';

/**
 * These outputs are a wire contract: receivers verify HMAC signatures with
 * their own crypto library, so the byte format must not drift when the
 * implementation changes (this file was added when signing moved from
 * node:crypto to Bun's native CryptoHasher).
 */

const PAYLOAD = '{"event":"message","session":"default","data":{"id":"abc"}}';
const SECRET = 'super-secret-key';

describe('webhook signing — wire format', () => {
  it('matches a hardcoded HMAC-SHA256 vector', () => {
    const expected = createHmac('sha256', SECRET).update(PAYLOAD).digest('hex');
    expect(generateWebhookSignature(PAYLOAD, SECRET)).toBe(expected);
  });

  it('is independent of the crypto implementation (node:crypto vs Bun)', () => {
    // Pinned literal so a future implementation swap cannot silently change it.
    expect(generateWebhookSignature('hello', 'key')).toBe(
      '9307b3b915efb5171ff14d8cb55fbcc798c6c0ef1456d66ded1a6aa723a58b7b',
    );
  });

  it('verifies its own signature and rejects tampering', () => {
    const signature = generateWebhookSignature(PAYLOAD, SECRET);
    expect(verifyWebhookSignature(PAYLOAD, signature, SECRET)).toBe(true);
    expect(verifyWebhookSignature(PAYLOAD + ' ', signature, SECRET)).toBe(false);
    expect(verifyWebhookSignature(PAYLOAD, signature, 'other-secret')).toBe(false);
    // Wrong length must not throw in the timing-safe comparison
    expect(verifyWebhookSignature(PAYLOAD, 'deadbeef', SECRET)).toBe(false);
  });

  it('produces deterministic, 32-char idempotency keys', () => {
    const data = { id: 'msg-1', from: '123@c.us' };
    const key = generateIdempotencyKey('message', 'default', data);
    expect(key).toHaveLength(32);
    expect(key).toBe(generateIdempotencyKey('message', 'default', data));
    expect(key).not.toBe(generateIdempotencyKey('message', 'other', data));
    expect(key).not.toBe(generateIdempotencyKey('message.any', 'default', data));
    // Same sha256 family as the signature helper
    const expected = createHash('sha256')
      .update(`message:default:${JSON.stringify(data)}`)
      .digest('hex')
      .slice(0, 32);
    expect(key).toBe(expected);
  });
});
