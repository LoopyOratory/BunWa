import { TooManyRequestsException } from '../exceptions';

/**
 * Audit metadata for a failed send, so the dashboard can group failures by a
 * stable reason instead of free text that embeds counts and timestamps.
 *
 * A send the sending policy refused is marked `reason: 'policy'` and carries
 * the policy's own reason ("Quiet hours are in effect (22:00-07:00)").
 */
export function sendFailureMetadata(error: unknown): Record<string, string> {
  if (error instanceof TooManyRequestsException) {
    return { reason: 'policy', policyReason: error.reason };
  }
  return {};
}

/**
 * A short, stable label for one failure. Policy refusals map to the rule that
 * fired; anything else is the error text with ids, numbers and URLs folded,
 * so "Chat 15551234567@c.us not found" and "Chat 15559876543@c.us not found"
 * land in the same group.
 */
export function failureReasonLabel(errorMessage: string | null, metadata: Record<string, any> | null): string {
  if (metadata?.reason === 'policy') {
    const reason = String(metadata.policyReason ?? '');
    if (/quiet hours/i.test(reason)) return 'Policy: quiet hours';
    if (/per minute/i.test(reason)) return 'Policy: per-minute cap';
    if (/per hour/i.test(reason)) return 'Policy: per-hour cap';
    if (/per day send cap/i.test(reason)) return 'Policy: daily cap';
    // The timelock message also mentions "new chats", so test it first.
    if (/reachout/i.test(reason)) return 'Policy: reachout timelock';
    if (/new chats/i.test(reason)) return 'Policy: new-chat quota';
    return 'Policy: other limit';
  }
  const text = (errorMessage ?? '').trim();
  if (!text) return 'Unknown error';
  return text
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/\b[\w.+-]+@(c\.us|s\.whatsapp\.net|g\.us|lid|newsletter)\b/g, '<chat>')
    .replace(/\b(true|false)_[^\s]+/g, '<message>')
    // Standalone numbers only: keep digits inside names ("shop-2") and HTTP status codes.
    .replace(/(?<!HTTP )(?<![\w-])\d+(?![\w-])/g, 'N')
    .slice(0, 120);
}
