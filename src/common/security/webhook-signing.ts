/**
 * HMAC-SHA256 webhook signing.
 * Computes a signature from the payload and secret, returns it as a hex string.
 * Used for X-WAHA-Signature header.
 */

import { createHmac } from 'crypto';

/**
 * Generate HMAC-SHA256 signature for webhook payload.
 * @param payload - The raw JSON string of the webhook payload
 * @param secret - The HMAC secret key configured on the webhook
 * @returns Hex-encoded signature string
 */
export function generateWebhookSignature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Verify a webhook signature against a payload.
 * @param payload - The raw JSON string
 * @param signature - The signature to verify (from X-WAHA-Signature header)
 * @param secret - The HMAC secret key
 * @returns true if signature is valid
 */
export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expected = generateWebhookSignature(payload, secret);
  if (expected.length !== signature.length) return false;
  // Timing-safe comparison
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

/**
 * Generate an idempotency key for a webhook event.
 * Deterministic based on event type, session, and relevant data.
 */
export function generateIdempotencyKey(event: string, sessionId: string, data: any): string {
  const payload = `${event}:${sessionId}:${JSON.stringify(data)}`;
  const { createHash } = require('crypto');
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}
