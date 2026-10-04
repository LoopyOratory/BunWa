/**
 * Per-session REST API keys.
 *
 * Mirrors the per-session MCP key precedent (`mcp-config.routes.ts`,
 * `mcp.server.ts`): the plaintext (`sk_ses_...`) is returned once, only its
 * SHA-256 hash is stored on the session config, and lookup iterates every
 * session's records. Revoked records are ignored, so a revoked key is
 * indistinguishable from an unknown one.
 */
import { CryptoHasher } from 'bun';
import { randomBytes, timingSafeEqual } from 'crypto';
import { Action } from '../../middleware/policies';
import type { RestApiKeyRecord, SessionConfig } from '../../structures/sessions.dto';
import type { SessionManager } from '../manager.core';

export const REST_API_KEY_PREFIX = 'sk_ses_';

/**
 * Actions a key receives when the operator does not pick an allowlist.
 * Read plus send is enough for scripts that fetch chats and reply, and it
 * deliberately excludes `manage` and `control`.
 */
export const DEFAULT_REST_API_KEY_ACTIONS: Action[] = [Action.Read, Action.Send];

export const REST_API_KEY_ACTIONS: Action[] = Object.values(Action);

export function isRestApiKey(value: string): boolean {
  return value.startsWith(REST_API_KEY_PREFIX);
}

export function hashRestApiKey(key: string): string {
  return new CryptoHasher('sha256').update(key).digest('hex');
}

/** Short display prefix (e.g. `sk_ses_1a2b3c4d`) stored beside the hash. */
export function restApiKeyPrefix(key: string): string {
  return key.slice(0, REST_API_KEY_PREFIX.length + 8);
}

export function generateRestApiKey(): string {
  return `${REST_API_KEY_PREFIX}${randomBytes(24).toString('hex')}`;
}

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function createRestApiKeyRecord(
  session: string,
  name: string,
  actions: Action[],
): { key: string; record: RestApiKeyRecord } {
  const key = generateRestApiKey();
  const record: RestApiKeyRecord = {
    id: Bun.randomUUIDv7(),
    session,
    name,
    keyHash: hashRestApiKey(key),
    prefix: restApiKeyPrefix(key),
    actions: [...new Set(actions)],
    createdAt: new Date().toISOString(),
  };
  return { key, record };
}

export interface ResolvedRestApiKey {
  session: string;
  record: RestApiKeyRecord;
}

/**
 * Resolve a presented plaintext key against every session's active records.
 * Returns null when the value is not a per-session REST key or nothing matches.
 */
export async function resolveRestApiKey(
  manager: SessionManager,
  providedKey: string,
): Promise<ResolvedRestApiKey | null> {
  if (!isRestApiKey(providedKey)) return null;

  const providedHash = hashRestApiKey(providedKey);
  const sessions = await manager.getSessions();
  for (const session of sessions) {
    const config: SessionConfig | undefined = manager.getSessionConfig(session.name);
    for (const record of config?.restApiKeys ?? []) {
      if (record.revokedAt) continue;
      if (safeCompare(record.keyHash, providedHash)) {
        return { session: session.name, record };
      }
    }
  }
  return null;
}

/** Validate an operator-supplied action allowlist. */
export function normalizeRestApiKeyActions(
  input: unknown,
): { actions: Action[]; error?: string } {
  if (input === undefined || input === null) {
    return { actions: [...DEFAULT_REST_API_KEY_ACTIONS] };
  }
  if (!Array.isArray(input) || input.length === 0) {
    return { actions: [], error: 'actions must be a non-empty array' };
  }
  const allowed = new Set<string>(REST_API_KEY_ACTIONS);
  const actions: Action[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string' || !allowed.has(raw)) {
      return { actions: [], error: `Unknown action '${String(raw)}'` };
    }
    if (!actions.includes(raw as Action)) actions.push(raw as Action);
  }
  return { actions };
}

export interface RestApiKeyMetadata {
  id: string;
  session: string;
  name: string;
  prefix: string;
  actions: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

/** Public shape of a key record. Never includes the hash. */
export function toRestApiKeyMetadata(record: RestApiKeyRecord): RestApiKeyMetadata {
  return {
    id: record.id,
    session: record.session,
    name: record.name,
    prefix: record.prefix,
    actions: record.actions,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt ?? null,
    revokedAt: record.revokedAt ?? null,
  };
}

/**
 * Remove server-managed hashes from a session config before it is returned
 * over the API. Plaintext is never stored, but the stored hashes should not
 * travel either, especially to a scoped key reading its own session.
 */
export function redactSessionSecrets(config: SessionConfig | undefined | null): SessionConfig {
  if (!config) return {};
  const next: SessionConfig = { ...config };
  delete next.restApiKeys;
  if (next.mcp?.apiKeyHash) {
    next.mcp = { ...next.mcp };
    delete next.mcp.apiKeyHash;
  }
  return next;
}

