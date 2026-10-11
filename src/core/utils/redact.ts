/**
 * Strip WhatsApp wire secrets and bulky binary blobs out of a message object
 * before it is returned to an API or MCP caller.
 *
 * A raw Baileys message carries the media encryption key, the file hashes, the
 * inline JPEG thumbnail, the waveform and the poll message secret. None of that
 * helps a caller — and a media key plus a media URL is enough to decrypt the
 * attachment — yet it ended up in every send response, and from there in agent
 * transcripts and logs. This keeps the structure (so `key.id`, `message.*.caption`,
 * `pushName`, `status` ... stay exactly where callers read them) and removes only
 * the secret / binary leaves.
 *
 * It returns a copy and never mutates its input: the objects handed in are often
 * the same references the message store holds.
 */

/** Property names that hold key material or bulky binary payloads. */
const SECRET_KEYS = new Set([
  'mediaKey',
  'fileEncSha256',
  'fileSha256',
  'midQualityFileSha256',
  'thumbnailSha256',
  'thumbnailEncSha256',
  'jpegThumbnail',
  'streamingSidecar',
  'scansSidecar',
  'scanLengths',
  'messageSecret',
  'waveform',
  'senderKeyDistributionMessage',
]);

const MAX_DEPTH = 24;

function isBinary(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array;
}

/** `{ type: 'Buffer', data: [...] }` — what a Buffer looks like once JSON-serialised. */
function isSerializedBuffer(value: any): boolean {
  return value && value.type === 'Buffer' && Array.isArray(value.data);
}

/** A protobuf Long, live or JSON-serialised: `{ low, high, unsigned }`. */
function isLong(value: any): boolean {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.low === 'number' &&
    typeof value.high === 'number' &&
    typeof value.unsigned === 'boolean'
  );
}

function longToNumber(value: any): number | string {
  const n = (value.high >>> 0) * 4294967296 + (value.low >>> 0);
  return Number.isSafeInteger(n) ? n : String(n);
}

export function redactWireSecrets<T>(value: T): T {
  return walk(value, new WeakSet(), 0) as T;
}

function walk(value: any, seen: WeakSet<object>, depth: number): any {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value !== 'object') {
    return value;
  }
  if (isBinary(value)) {
    return `<${value.byteLength} bytes>`;
  }
  if (isSerializedBuffer(value)) {
    return `<${value.data.length} bytes>`;
  }
  if (isLong(value)) {
    return longToNumber(value);
  }
  if (value instanceof Date) {
    return value;
  }
  if (depth >= MAX_DEPTH || seen.has(value)) {
    return undefined;
  }
  seen.add(value);
  let out: any;
  if (Array.isArray(value)) {
    out = value.map((item) => walk(item, seen, depth + 1));
  } else {
    out = {};
    for (const [key, item] of Object.entries(value)) {
      if (SECRET_KEYS.has(key)) {
        continue;
      }
      const next = walk(item, seen, depth + 1);
      if (next !== undefined) {
        out[key] = next;
      }
    }
  }
  seen.delete(value);
  return out;
}
