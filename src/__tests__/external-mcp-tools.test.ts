import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { BunSqliteClient, SqlAgentStore } from '../core/agent/agent.sql';
import { AgentService, setAgentStoreForTests } from '../core/agent/agent.service';
import { externalToolQualifiedName } from '../core/agent/external-mcp.names';
import { buildAllTools } from '../mcp/tools';
import type { ExternalMcpTool } from '../core/agent/agent.types';

function makeStore(): SqlAgentStore {
  return new SqlAgentStore(new BunSqliteClient(new Database(':memory:')));
}

function externalTool(overrides: Partial<ExternalMcpTool> = {}): ExternalMcpTool {
  const serverId = overrides.serverId ?? 'server-1234';
  const name = overrides.name ?? 'echo_test';
  return {
    id: 'tool-1',
    serverId,
    serverName: 'Local Echo',
    name,
    qualifiedName: externalToolQualifiedName(serverId, name),
    description: 'Echo a message',
    inputSchema: {
      type: 'object',
      properties: { message: { type: 'string', minLength: 1 } },
      required: ['message'],
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
    tier: 'read',
    destructive: false,
    enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('external MCP tool names', () => {
  test('prefixes a stable server id and sanitizes the remote name', () => {
    const name = externalToolQualifiedName('01a1f1f3-cbdf-75c1', 'Search Notes');
    expect(name).toBe('ext__01a1f1f3__search_notes');
    expect(name).toMatch(/^[a-z][a-z0-9_]{0,63}$/);
    expect(externalToolQualifiedName('01a1f1f3-cbdf-75c1', 'Search Notes')).toBe(name);
  });

  test('keeps the same remote name distinct across servers', () => {
    expect(externalToolQualifiedName('server-a', 'search')).not.toBe(
      externalToolQualifiedName('server-b', 'search'),
    );
  });
});

describe('external MCP descriptors', () => {
  test('advertises the persisted JSON Schema and keeps the remote name', () => {
    const tool = externalTool();
    const descriptors = buildAllTools(
      {} as never,
      [tool],
      new Map([[tool.serverId, { url: 'https://example.com/mcp', headers: {}, name: 'Local Echo' }]]),
    );
    const descriptor = descriptors.find((candidate) => candidate.name === tool.qualifiedName);
    expect(descriptor).toBeTruthy();
    expect(descriptor?.remoteName).toBe('echo_test');
    expect(descriptor?.external).toBe(true);
    expect(descriptor?.category).toBe('external');
    expect(descriptor?.inputSchema.safeParse({ message: 'hi' }).success).toBe(true);
    expect(descriptor?.inputSchema.safeParse({}).success).toBe(false);
  });
});

describe('external MCP persistence', () => {
  test('diffs tools on refresh instead of deleting and recreating them', async () => {
    const store = makeStore();
    await store.init();
    const server = await store.createExternalMcpServer({
      name: 'Local Echo',
      url: 'http://127.0.0.1:3998/mcp',
    });

    const first = await store.upsertExternalMcpTools(server.id, [
      {
        name: 'echo_test',
        description: 'Echo a message',
        inputSchema: { type: 'object', properties: { message: { type: 'string' } } },
        annotations: { readOnlyHint: true },
        tier: 'read',
        destructive: false,
      },
      {
        name: 'write_test',
        description: 'Write a note',
        inputSchema: { type: 'object', properties: { title: { type: 'string' } } },
        annotations: { readOnlyHint: false, destructiveHint: true },
        tier: 'write',
        destructive: true,
      },
    ]);
    const echoId = first.find((tool) => tool.name === 'echo_test')?.id;
    expect(first).toHaveLength(2);
    expect(first[0].qualifiedName).toStartWith('ext__');

    const second = await store.upsertExternalMcpTools(server.id, [
      {
        name: 'echo_test',
        description: 'Echo a message, updated',
        inputSchema: { type: 'object', properties: { message: { type: 'string' } } },
        annotations: { readOnlyHint: true },
        tier: 'read',
        destructive: false,
      },
      {
        name: 'new_tool',
        description: 'A new tool',
        inputSchema: { type: 'object', properties: {} },
        annotations: null,
        tier: 'read',
        destructive: false,
      },
    ]);

    expect(second).toHaveLength(2);
    expect(second.find((tool) => tool.name === 'echo_test')?.id).toBe(echoId);
    expect(second.find((tool) => tool.name === 'write_test')).toBeUndefined();
    expect(second.find((tool) => tool.name === 'echo_test')?.description).toBe('Echo a message, updated');
    await store.close();
  });

  test('hides tools from disabled servers and records refresh status', async () => {
    const store = makeStore();
    await store.init();
    const server = await store.createExternalMcpServer({
      name: 'Local Echo',
      url: 'http://127.0.0.1:3998/mcp',
    });
    await store.upsertExternalMcpTools(server.id, [
      {
        name: 'echo_test',
        description: 'Echo a message',
        inputSchema: { type: 'object', properties: {} },
        annotations: null,
        tier: 'read',
        destructive: false,
      },
    ]);

    await store.updateExternalMcpServer(server.id, { enabled: false });
    expect(await store.listExternalMcpTools()).toHaveLength(0);
    await store.updateExternalMcpServer(server.id, { enabled: true });
    expect(await store.listExternalMcpTools()).toHaveLength(1);

    const refreshed = await store.markExternalMcpServerRefresh(server.id, {
      refreshedAt: '2026-01-01T00:00:00.000Z',
      error: null,
    });
    expect(refreshed?.lastRefreshedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(refreshed?.lastError).toBeNull();
    const failed = await store.markExternalMcpServerRefresh(server.id, { error: 'connection refused' });
    expect(failed?.lastError).toBe('connection refused');
    await store.close();
  });

  test('removes deleted server tools from every agent allowlist', async () => {
    const store = makeStore();
    await store.init();
    setAgentStoreForTests(store);
    const service = new AgentService();

    const server = await store.createExternalMcpServer({
      name: 'Local Echo',
      url: 'http://127.0.0.1:3998/mcp',
    });
    const tools = await store.upsertExternalMcpTools(server.id, [
      {
        name: 'echo_test',
        description: 'Echo a message',
        inputSchema: { type: 'object', properties: {} },
        annotations: null,
        tier: 'read',
        destructive: false,
      },
    ]);
    const qualified = tools[0].qualifiedName;
    const agent = await store.createAgent({
      name: 'Support',
      settings: {
        mcp: {
          enabled: true,
          allowedTools: [qualified, 'echo_test', 'MessageSendText'],
          deniedTools: ['echo_test'],
          destructiveOps: false,
        },
      },
    });

    expect(await service.deleteExternalMcpServer(server.id)).toBe(true);
    const updated = await store.getAgent(agent.id);
    const mcp = updated?.settings.mcp as { allowedTools: string[]; deniedTools: string[] };
    expect(mcp.allowedTools).toEqual(['MessageSendText']);
    expect(mcp.deniedTools).toEqual([]);

    setAgentStoreForTests(null);
    await store.close();
  });
});
