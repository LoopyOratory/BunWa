/**
 * Compact message objects for MCP results.
 *
 * A message from the engine carries `_data`: the raw protocol message, often
 * kilobytes each with media keys, hashes and thumbnails. A 12-message history
 * page became tens of kilobytes, which is what pushed results past the size at
 * which they broke. Agents read the normalised fields (body, from, type, media,
 * replyTo ...), so `_data` is left out unless the caller asks for it, and empty
 * fields are dropped.
 */
import { redactWireSecrets } from '../../core/utils/redact';

function isEmpty(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === 'string' && value === '')
  );
}

export function compactMessage(message: any, includeRaw = false): any {
  if (!message || typeof message !== 'object') {
    return message;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(message)) {
    if (key === '_data' || isEmpty(value)) {
      continue;
    }
    out[key] = value;
  }
  // Keep the useful bit of the raw data: who sent it, by display name.
  const pushName = message._data?.pushName;
  if (pushName && !out.pushName) {
    out.pushName = pushName;
  }
  if (out.replyTo && typeof out.replyTo === 'object') {
    const { _data, ...replyTo } = out.replyTo as Record<string, unknown>;
    out.replyTo = replyTo;
  }
  if (includeRaw && message._data) {
    out._data = redactWireSecrets(message._data);
  }
  return out;
}

export function compactMessages(messages: unknown, includeRaw = false): unknown {
  return Array.isArray(messages) ? messages.map((m) => compactMessage(m, includeRaw)) : messages;
}
