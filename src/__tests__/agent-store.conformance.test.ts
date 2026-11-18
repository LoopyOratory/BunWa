import { afterAll, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { BunSqliteClient, KnexSqlClient, SqlAgentStore } from '../core/agent/agent.sql';
import { makePostgresKnex } from '../core/db/knex-postgres';
import { startEmbeddedPostgres, type EmbeddedPostgres } from './conformance/embedded-postgres';

let embedded: EmbeddedPostgres | null = null;
let postgresUrl = process.env.BUNWA_TEST_POSTGRES_URL;
if (!postgresUrl) {
  try {
    embedded = await startEmbeddedPostgres();
    postgresUrl = embedded.url;
  } catch {
    postgresUrl = undefined;
  }
}

afterAll(async () => {
  if (embedded) await embedded.stop();
});

async function sqliteStore(): Promise<SqlAgentStore> {
  const store = new SqlAgentStore(new BunSqliteClient(new Database(':memory:')));
  await store.init();
  return store;
}

async function postgresStore(): Promise<SqlAgentStore> {
  const store = new SqlAgentStore(new KnexSqlClient(makePostgresKnex(postgresUrl!)));
  await store.init();
  return store;
}

function runSuite(name: string, makeStore: () => Promise<SqlAgentStore>) {
  describe(`agent store: ${name}`, () => {
    test('creates, updates, and deletes an agent', async () => {
      const store = await makeStore();
      const agent = await store.createAgent({ name: 'Support' });
      expect(agent.status).toBe('draft');
      expect(agent.name).toBe('Support');

      const updated = await store.updateAgent(agent.id, {
        prompt: 'Be helpful',
        status: 'active',
        fallbackModel: 'backup-model',
      });
      expect(updated?.prompt).toBe('Be helpful');
      expect(updated?.status).toBe('active');
      expect(updated?.fallbackModel).toBe('backup-model');
      expect(await store.listAgents()).toHaveLength(1);
      expect(await store.deleteAgent(agent.id)).toBe(true);
      expect(await store.getAgent(agent.id)).toBeNull();
      await store.close();
    });

    test('stores skills, knowledge, and the effective prompt', async () => {
      const store = await makeStore();
      const agent = await store.createAgent({ name: 'Support', prompt: 'You are support.' });
      const skill = await store.addSkill(agent.id, {
        name: 'Order lookup',
        description: 'Look up an order',
        instructions: 'Ask for the order number.',
      });
      expect(skill.enabled).toBe(true);
      expect(await store.listSkills(agent.id)).toHaveLength(1);

      const source = await store.addKnowledge(agent.id, {
        name: 'Refund policy',
        kind: 'text',
        content: 'Refunds take five days.',
      });
      expect(source.status).toBe('pending');
      expect(await store.listKnowledge(agent.id)).toHaveLength(1);

      expect(await store.deleteSkill(agent.id, skill.id)).toBe(true);
      expect(await store.deleteKnowledge(agent.id, source.id)).toBe(true);
      await store.close();
    });

    test('stores user profiles, conversations, and reviews', async () => {
      const store = await makeStore();
      const agent = await store.createAgent({ name: 'Support' });

      const profile = await store.upsertUserProfile({
        userId: '233500000000@c.us',
        displayName: 'Ama',
        phone: '233500000000',
        tags: ['vip'],
        preferences: { language: 'en' },
        importantDetails: { plan: 'gold' },
      });
      expect(profile.displayName).toBe('Ama');
      expect(profile.tags).toEqual(['vip']);

      const conversation = await store.createConversation({
        agentId: agent.id,
        userId: profile.userId,
        reviewEnabled: true,
      });
      expect(conversation.status).toBe('open');
      expect(conversation.reviewEnabled).toBe(true);

      const reviewed = await store.submitReview(conversation.id, 5, 'Great');
      expect(reviewed?.reviewRating).toBe(5);
      expect(reviewed?.reviewText).toBe('Great');

      const closed = await store.closeConversation(conversation.id);
      expect(closed?.status).toBe('closed');
      await store.close();
    });

    test('stores chat and voice/call model settings without returning keys', async () => {
      const store = await makeStore();
      const chat = await store.updateModelSettings({
        provider: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-chat',
        model: 'gpt-4o-mini',
        fallbackProvider: 'anthropic',
        fallbackBaseUrl: 'https://api.anthropic.com',
        fallbackApiKey: 'sk-fallback',
        fallbackModel: 'claude-3-5-haiku',
      });
      expect(chat.hasApiKey).toBe(true);
      expect(chat.hasFallbackApiKey).toBe(true);
      const secrets = await store.getModelSettingsSecrets();
      expect(secrets.apiKey).toBe('sk-chat');
      expect(secrets.fallbackApiKey).toBe('sk-fallback');

      const voice = await store.updateModelRoleSettings('voice', {
        provider: 'fish',
        baseUrl: 'https://api.fish.audio/v1',
        apiKey: 'fish-key',
        model: 's2.1-pro',
      });
      expect(voice.provider).toBe('fish');
      expect(voice.hasApiKey).toBe(true);

      const call = await store.updateModelRoleSettings('call', {
        provider: 'google',
        baseUrl: 'https://generativelanguage.googleapis.com',
        model: 'gemini-3.8-flash',
      });
      expect(call.provider).toBe('google');
      expect((await store.listModelRoleSettings()).map((role) => role.role).sort()).toEqual(['call', 'voice']);
      await store.close();
    });

    test('stores external MCP servers and tools', async () => {
      const store = await makeStore();
      const server = await store.createExternalMcpServer({
        name: 'Notion',
        description: 'Workspace notes',
        url: 'https://mcp.notion.com/mcp',
        headers: { Authorization: 'Bearer demo' },
      });
      expect(server.enabled).toBe(true);

      const tools = await store.upsertExternalMcpTools(server.id, [
        {
          name: 'search_notes',
          description: 'Search notes',
          inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
          annotations: { readOnlyHint: true },
          tier: 'read',
          destructive: false,
        },
        {
          name: 'create_note',
          description: 'Create a note',
          inputSchema: { type: 'object', properties: { title: { type: 'string' } } },
          annotations: { readOnlyHint: false, destructiveHint: true },
          tier: 'write',
          destructive: true,
        },
      ]);
      expect(tools).toHaveLength(2);
      expect(tools[0].serverName).toBe('Notion');
      expect((await store.listExternalMcpTools()).length).toBe(2);
      expect(await store.deleteExternalMcpServer(server.id)).toBe(true);
      expect(await store.listExternalMcpTools()).toHaveLength(0);
      await store.close();
    });

    test('records and filters analytics events', async () => {
      const store = await makeStore();
      const agent = await store.createAgent({ name: 'Support' });
      const conversation = await store.createConversation({ agentId: agent.id });
      await store.recordEvent({
        type: 'conversion',
        agentId: agent.id,
        conversationId: conversation.id,
        data: { value: 10 },
      });
      await store.recordEvent({ type: 'conversation.started', agentId: agent.id });
      const events = await store.listEvents({ agentId: agent.id, type: 'conversion' });
      expect(events).toHaveLength(1);
      expect(events[0].data).toEqual({ value: 10 });
      await store.close();
    });
  });
}

runSuite('sqlite', sqliteStore);
const postgresDescribe = postgresUrl ? describe : describe.skip;
if (!postgresUrl) {
  postgresDescribe('agent store: postgres (skipped)', () => {
    test('no postgres server available', () => {});
  });
} else {
  runSuite('postgres', postgresStore);
}
