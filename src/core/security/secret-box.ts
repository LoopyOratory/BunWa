import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * Envelope encryption for secrets that must be readable by an admin later.
 *
 * Authentication always uses a one-way hash. This module only protects the
 * recoverable copy used by the "view key" action. The master secret must stay
 * stable: rotating it makes previously sealed values unreadable.
 */
const PREFIX = 'enc:v1:';

function masterKeySource(): 'explicit' | 'waha-api-key' | 'bunwa-api-key' | null {
  if (process.env.BUNWA_KEY_ENCRYPTION_SECRET) return 'explicit';
  if (process.env.WAHA_API_KEY) return 'waha-api-key';
  if (process.env.BUNWA_API_KEY) return 'bunwa-api-key';
  return null;
}

/**
 * True when the encryption master key is derived from the API key instead of
 * BUNWA_KEY_ENCRYPTION_SECRET. Rotating that API key makes every sealed value
 * unreadable, so callers should warn loudly while this fallback is active.
 */
export function usingEncryptionKeyFallback(): boolean {
  return encryptionConfigured() && masterKeySource() !== 'explicit';
}

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

  const key = masterKey();
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(ivPart, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart, 'base64url')),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  } catch {
    // GCM authentication failed: this was sealed under a different master key.
    // Say so instead of leaking a generic crypto error, because the usual cause
    // is WAHA_API_KEY (or BUNWA_KEY_ENCRYPTION_SECRET) being rotated after the
    // value was sealed, and the recovery is restore-the-old-secret or re-issue.
    throw new Error(
      'Sealed secret cannot be decrypted — it was sealed under a different master key. ' +
        'Restore BUNWA_KEY_ENCRYPTION_SECRET (or the API key) that was set when the value was stored, ' +
        'or regenerate the key. Revealing with the current secret will never succeed.',
    );
  }
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
