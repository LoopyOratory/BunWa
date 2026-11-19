import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * Envelope encryption for secrets that must be readable by an admin later.
 *
 * Authentication always uses a one-way hash. This module only protects the
 * recoverable copy used by the "view key" action. The master secret must stay
 * stable: rotating it makes previously sealed values unreadable.
 */
const PREFIX = 'enc:v1:';

function masterKey(): Buffer {
  const secret =
    process.env.BUNWA_KEY_ENCRYPTION_SECRET ||
    process.env.WAHA_API_KEY ||
    process.env.BUNWA_API_KEY ||
    '';
  if (!secret) {
    throw new Error(
      'BUNWA_KEY_ENCRYPTION_SECRET is required to store recoverable secrets',
    );
  }
  return createHash('sha256').update(secret).digest();
}

export function isSealedSecret(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function encryptionConfigured(): boolean {
  return Boolean(
    process.env.BUNWA_KEY_ENCRYPTION_SECRET ||
      process.env.WAHA_API_KEY ||
      process.env.BUNWA_API_KEY,
  );
}

export function sealSecret(value: string): string {
  if (!value) return value;
  if (isSealedSecret(value)) return value;

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function openSecret(value: string): string {
  if (!value || !isSealedSecret(value)) return value;
  const payload = value.slice(PREFIX.length);
  const [ivPart, tagPart, ciphertextPart] = payload.split('.');
  if (!ivPart || !tagPart || !ciphertextPart) {
    throw new Error('Stored secret is malformed');
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    masterKey(),
    Buffer.from(ivPart, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, 'base64url')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

/** Best-effort open for lists: a rotated master key must not break the page. */
export function tryOpenSecret(value: string): string | null {
  try {
    return openSecret(value);
  } catch {
    return null;
  }
}

export function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function secretPrefix(value: string, length = 12): string {
  return value.slice(0, Math.max(1, Math.min(length, value.length)));
}
