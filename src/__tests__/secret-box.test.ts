import 'reflect-metadata';
import { beforeAll, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { BunSqliteClient, SqlAgentStore } from '../core/agent/agent.sql';
import { hashSecret, openSecret, sealSecret } from '../core/security/secret-box';

beforeAll(() => {
  process.env.BUNWA_KEY_ENCRYPTION_SECRET ??= 'test-secret';
});

describe('secret box', () => {
  test('round-trips a secret and never stores the plaintext', () => {
    const secret = 'sk_agent_abcdef123456';
    const sealed = sealSecret(secret);
    expect(sealed.startsWith('enc:v1:')).toBe(true);
    expect(sealed).not.toContain(secret);
    expect(openSecret(sealed)).toBe(secret);
  });

  test('produces a different ciphertext each time', () => {
    expect(sealSecret('same')).not.toBe(sealSecret('same'));
  });

  test('hashes deterministically for authentication', () => {
    expect(hashSecret('same')).toBe(hashSecret('same'));
    expect(hashSecret('same')).not.toBe(hashSecret('different'));
  });

  test('passes legacy plaintext through unchanged', () => {
    expect(openSecret('plain-legacy')).toBe('plain-legacy');
  });

  test('rejects a tampered ciphertext', () => {
    const sealed = sealSecret('secret');
    const tampered = sealed.slice(0, -2) + (sealed.endsWith('aa') ? 'bb' : 'aa');
    expect(() => openSecret(tampered)).toThrow();
  });
});

describe('external MCP header storage', () => {
  test('encrypts header values at rest and decrypts them for calls', async () => {
    const store = new SqlAgentStore(new BunSqliteClient(new Database(':memory:')));
    await store.init();
    const server = await store.createExternalMcpServer({
      name: 'Encrypted',
      url: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer super-secret' },
    });

    const raw = await (store as any).client.query('SELECT headers FROM bunwa_external_mcp_servers WHERE id = ?', [server.id]);
    expect(raw[0].headers).toContain('enc:v1:');
    expect(raw[0].headers).not.toContain('super-secret');

    const loaded = await store.getExternalMcpServer(server.id);
    expect(loaded?.headers.Authorization).toBe('Bearer super-secret');
    await store.close();
  });
});
