import 'reflect-metadata';
import { describe, it, expect, beforeAll } from 'bun:test';
import { Hono } from 'hono';
import { container } from 'tsyringe';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { configureContainer } from '../di/container';
import { SessionManager } from '../core/manager.core';
import { AuditService } from '../core/audit/audit.service';
import { createApiRouter } from '../api';
import { createMcpRouter } from '../mcp/mcp.server';
import { hashRestApiKey } from '../core/api-keys/rest-api-keys';

const MASTER_KEY = 'master-rest-key';
process.env.WAHA_API_KEY = MASTER_KEY;
process.env.WAHA_DASHBOARD_USERNAME = 'admin';
process.env.WAHA_DASHBOARD_PASSWORD = 'admin-pass';

const BASIC_AUTH = `Basic ${Buffer.from('admin:admin-pass').toString('base64')}`;

function parseSse(body: string): object[] {
  const results: object[] = [];
  for (const line of body.split('\n')) {
    if (line.startsWith('data: ')) {
      results.push(JSON.parse(line.slice(6)));
    }
  }
  return results;
}

describe('per-session REST API keys', () => {
  let app: Hono;
  let mcpApp: Hono;
  let manager: SessionManager;
  let scopedKey: string;
  let scopedKeyId: string;

  async function api(path: string, options: { method?: string; key?: string; basic?: string; body?: unknown } = {}) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options.key) headers['x-api-key'] = options.key;
    if (options.basic) headers['Authorization'] = options.basic;
    return app.request(`http://localhost${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  }

  beforeAll(async () => {
    configureContainer();
    // Isolate the audit DB from the real ./data directory.
    container.registerInstance(
      AuditService,
      new AuditService(mkdtempSync(join(tmpdir(), 'bunwa-rest-keys-audit-'))),
    );
    manager = container.resolve(SessionManager);
    await manager.upsert('alpha', {});
    await manager.upsert('beta', {});

    app = new Hono();
    app.route('/', createApiRouter());
    mcpApp = new Hono();
    mcpApp.route('/', createMcpRouter(manager));

    const created = await api('/api/sessions/alpha/api-keys', {
      method: 'POST',
      key: MASTER_KEY,
      body: { name: 'ci', actions: ['read', 'send'] },
    });
    expect(created.status).toBe(200);
    const payload = await created.json() as { key: string; id: string };
    expect(payload.key.startsWith('sk_ses_')).toBe(true);
    scopedKey = payload.key;
    scopedKeyId = payload.id;
  });

  describe('scoped access', () => {
    it('succeeds on its own session for a permitted action', async () => {
      const res = await api('/api/sessions/alpha', { key: scopedKey });
      expect(res.status).toBe(200);
      const body = await res.json() as { name: string };
      expect(body.name).toBe('alpha');
    });

    it('fails for an action outside its allowlist', async () => {
      // control is not in the key's allowlist even though the session matches
      const stop = await api('/api/sessions/alpha/stop', { method: 'POST', key: scopedKey });
      expect(stop.status).toBe(403);

      const update = await api('/api/sessions/alpha', {
        method: 'PUT',
        key: scopedKey,
        body: { config: {} },
      });
      expect(update.status).toBe(403);
    });

    it('honours a read-only allowlist on the key\'s own session', async () => {
      const created = await api('/api/sessions/alpha/api-keys', {
        method: 'POST',
        key: MASTER_KEY,
        body: { name: 'read-only', actions: ['read'] },
      });
      const payload = await created.json() as { key: string };
      const readOnlyKey = payload.key;

      const read = await api('/api/sessions/alpha', { key: readOnlyKey });
      expect(read.status).toBe(200);

      const send = await api('/api/sendText', {
        method: 'POST',
        key: readOnlyKey,
        body: { session: 'alpha', chatId: '15551234567@c.us', text: 'hi' },
      });
      expect(send.status).toBe(403);
    });

    it('allows a permitted action on its own session through a body-derived route', async () => {
      // Policy passes for send on alpha; the shared body-session guard then
      // answers 422 because the session exists but is not connected. A 403
      // would mean the body-derived session ownership check rejected it.
      const send = await api('/api/sendText', {
        method: 'POST',
        key: scopedKey,
        body: { session: 'alpha', chatId: '15551234567@c.us', text: 'hi' },
      });
      expect(send.status).toBe(422);
    });

    it('cannot mint or rewrite key material through the session config endpoint', async () => {
      const created = await api('/api/sessions/alpha/api-keys', {
        method: 'POST',
        key: MASTER_KEY,
        body: { name: 'setting-key', actions: ['read', 'setting'] },
      });
      const { key: settingKey } = await created.json() as { key: string };

      const injected = {
        id: 'injected-key-id',
        session: 'alpha',
        name: 'injected',
        keyHash: hashRestApiKey(`sk_ses_${'f'.repeat(48)}`),
        prefix: 'sk_ses_ffffffff',
        actions: ['read', 'send', 'control', 'manage'],
        createdAt: new Date().toISOString(),
      };
      const res = await api('/api/sessions/alpha', {
        method: 'PUT',
        key: settingKey,
        body: {
          config: {
            metadata: { touched: 'yes' },
            restApiKeys: [injected],
            mcp: { apiKeyHash: 'f'.repeat(64) },
          },
        },
      });
      expect(res.status).toBe(200);

      const config = manager.getSessionConfig('alpha');
      expect(config?.metadata?.touched).toBe('yes');
      expect(config?.restApiKeys?.some((key) => key.id === 'injected-key-id')).toBe(false);
      expect(config?.mcp?.apiKeyHash).not.toBe('f'.repeat(64));
    });

    it('denies cross-session access without disclosing whether the session exists', async () => {
      const other = await api('/api/sessions/beta', { key: scopedKey });
      const missing = await api('/api/sessions/does-not-exist', { key: scopedKey });

      expect(other.status).toBe(403);
      expect(missing.status).toBe(403);
      expect(await other.text()).toBe(await missing.text());

      const bodyRoute = await api('/api/sendText', {
        method: 'POST',
        key: scopedKey,
        body: { session: 'beta', chatId: '15551234567@c.us', text: 'hi' },
      });
      expect(bodyRoute.status).toBe(403);
    });
  });

  describe('server-level boundary', () => {
    it('denies every server-level route for a scoped key', async () => {
      expect((await api('/api/sessions', { key: scopedKey })).status).toBe(403);
      expect((await api('/api/sessions', { method: 'POST', key: scopedKey, body: { name: 'gamma' } })).status).toBe(403);
      expect((await api('/api/audit', { key: scopedKey })).status).toBe(403);
      expect((await api('/api/infra/config', { key: scopedKey })).status).toBe(403);
      expect((await api('/api/server/stop', { method: 'POST', key: scopedKey })).status).toBe(403);
    });

    it('denies key management for any session, including its own', async () => {
      expect((await api('/api/sessions/alpha/api-keys', { key: scopedKey })).status).toBe(403);
      expect((await api('/api/sessions/alpha/api-keys', { method: 'POST', key: scopedKey, body: {} })).status).toBe(403);
      expect((await api(`/api/sessions/alpha/api-keys/${scopedKeyId}`, { method: 'DELETE', key: scopedKey })).status).toBe(403);
      expect((await api(`/api/sessions/alpha/api-keys/${scopedKeyId}/rotate`, { method: 'POST', key: scopedKey })).status).toBe(403);
    });
  });

  describe('revocation', () => {
    it('rejects a revoked key exactly like an unknown key', async () => {
      const created = await api('/api/sessions/alpha/api-keys', {
        method: 'POST',
        key: MASTER_KEY,
        body: { name: 'to-revoke' },
      });
      const payload = await created.json() as { key: string; id: string };

      const revoke = await api(`/api/sessions/alpha/api-keys/${payload.id}`, {
        method: 'DELETE',
        key: MASTER_KEY,
      });
      expect(revoke.status).toBe(200);

      const revoked = await api('/api/sessions/alpha', { key: payload.key });
      const unknown = await api('/api/sessions/alpha', { key: `sk_ses_${'0'.repeat(48)}` });

      expect(revoked.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(await revoked.text()).toBe(await unknown.text());
    });
  });

  describe('existing credentials keep full admin access', () => {
    it('still accepts the master API key everywhere', async () => {
      expect((await api('/api/sessions', { key: MASTER_KEY })).status).toBe(200);
      expect((await api('/api/audit', { key: MASTER_KEY })).status).toBe(200);
      expect((await api('/api/infra/config', { key: MASTER_KEY })).status).toBe(200);
      expect((await api('/api/sessions/alpha/api-keys', { key: MASTER_KEY })).status).toBe(200);
    });

    it('still accepts dashboard Basic credentials everywhere', async () => {
      expect((await api('/api/sessions', { basic: BASIC_AUTH })).status).toBe(200);
      expect((await api('/api/audit', { basic: BASIC_AUTH })).status).toBe(200);
      expect((await api('/api/sessions/alpha/api-keys', { basic: BASIC_AUTH })).status).toBe(200);
    });
  });

  describe('credential separation from MCP', () => {
    it('rejects an MCP key on the REST API', async () => {
      const generated = await api('/api/sessions/alpha/mcp/generate-key', {
        method: 'POST',
        key: MASTER_KEY,
      });
      expect(generated.status).toBe(200);
      const { key: mcpKey } = await generated.json() as { key: string };
      expect(mcpKey.startsWith('sk_mcp_')).toBe(true);

      const res = await api('/api/sessions/alpha', { key: mcpKey });
      expect(res.status).toBe(401);
    });

    it('rejects a REST key on the MCP endpoint and keeps MCP keys working', async () => {
      const call = (key: string) => mcpApp.request('http://localhost/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Mcp-Protocol-Version': '2025-11-25',
          'X-Api-Key': key,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'SessionGet', arguments: { sessionId: 'alpha' } },
        }),
      });

      const restCall = await call(scopedKey);
      const restBody = await restCall.text();
      expect(restBody).toContain('Invalid or missing API key');

      const generated = await api('/api/sessions/alpha/mcp/generate-key', {
        method: 'POST',
        key: MASTER_KEY,
      });
      const { key: mcpKey } = await generated.json() as { key: string };
      const mcpCall = await call(mcpKey);
      const mcpBody = await mcpCall.text();
      expect(mcpBody).not.toContain('Invalid or missing API key');
      const payloads = parseSse(mcpBody) as any[];
      expect(JSON.stringify(payloads)).toContain('alpha');
    });
  });

  describe('storage', () => {
    it('stores a hash and never the plaintext', () => {
      const config = manager.getSessionConfig('alpha');
      const record = config?.restApiKeys?.find((key) => key.id === scopedKeyId);
      expect(record).toBeDefined();
      expect(record!.keyHash).toBe(hashRestApiKey(scopedKey));
      expect(record!.keyHash).toHaveLength(64);

      const serialized = JSON.stringify(config);
      expect(serialized).not.toContain(scopedKey);
      expect(serialized).toContain(record!.keyHash);
    });

    it('lists metadata without the hash', async () => {
      const res = await api('/api/sessions/alpha/api-keys', { key: MASTER_KEY });
      expect(res.status).toBe(200);
      const body = await res.json() as { keys: Array<Record<string, unknown>> };
      expect(body.keys.length).toBeGreaterThan(0);
      for (const entry of body.keys) {
        expect(entry.keyHash).toBeUndefined();
        expect(entry.id).toBeDefined();
        expect(entry.prefix).toBeDefined();
        expect(Array.isArray(entry.actions)).toBe(true);
      }
      expect(JSON.stringify(body)).not.toContain('keyHash');
    });
  });
});
