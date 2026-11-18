import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { BunSqliteClient, SqlAgentStore } from '../core/agent/agent.sql';
import { composePrompt, nextQuestion, isComplete } from '../core/agent/agent.builder';
import { probeModelSettings } from '../core/agent/model-probe';

function makeStore(): SqlAgentStore {
  return new SqlAgentStore(new BunSqliteClient(new Database(':memory:')));
}

describe('agent builder', () => {
  test('asks required questions in order', () => {
    expect(nextQuestion({})?.id).toBe('name');
    expect(nextQuestion({ name: 'Vei' })?.id).toBe('role');
    expect(nextQuestion({ name: 'Vei', role: 'help', audience: 'customers', tone: 'warm', goals: 'sell' })).toBeNull();
  });

  test('composes a usable prompt', () => {
    const prompt = composePrompt({
      name: 'Vei',
      role: 'help customers choose the right product',
      audience: 'WhatsApp shoppers in Ghana',
      tone: 'warm and direct',
      goals: 'Answer product questions\nTake orders',
      boundaries: 'Never invent prices',
      fallback: 'I will check with the team.',
      language: 'English',
    });
    expect(prompt).toContain('You are Vei.');
    expect(prompt).toContain('Your priorities:');
    expect(prompt).toContain('- Take orders');
    expect(prompt).toContain('Never do this:');
    expect(prompt).toContain('I will check with the team.');
  });

  test('detects completion', () => {
    expect(isComplete({ name: 'a', role: 'b', audience: 'c', tone: 'd', goals: 'e' })).toBe(true);
    expect(isComplete({ name: 'a' })).toBe(false);
  });
});

describe('agent store', () => {
  test('creates, updates, and deletes an agent', async () => {
    const store = makeStore();
    await store.init();

    const agent = await store.createAgent({ name: 'Support' });
    expect(agent.status).toBe('draft');
    expect(agent.name).toBe('Support');

    const updated = await store.updateAgent(agent.id, { prompt: 'Be helpful', status: 'active', fallbackModel: 'backup-model' });
    expect(updated?.prompt).toBe('Be helpful');
    expect(updated?.status).toBe('active');
    expect(updated?.fallbackModel).toBe('backup-model');

    expect(await store.listAgents()).toHaveLength(1);
    expect(await store.deleteAgent(agent.id)).toBe(true);
    expect(await store.getAgent(agent.id)).toBeNull();
    await store.close();
  });

  test('stores MCP skill settings with the agent', async () => {
    const store = makeStore();
    await store.init();

    const agent = await store.createAgent({
      name: 'MCP agent',
      settings: {
        mcp: {
          enabled: true,
          allowedTools: ['MessageSendText', 'SessionGet'],
          deniedTools: [],
          destructiveOps: false,
        },
      },
    });

    expect(agent.settings.mcp).toEqual({
      enabled: true,
      allowedTools: ['MessageSendText', 'SessionGet'],
      deniedTools: [],
      destructiveOps: false,
    });

    const updated = await store.updateAgent(agent.id, {
      settings: {
        ...agent.settings,
        mcp: {
          enabled: false,
          allowedTools: ['MessageSendText'],
          deniedTools: [],
          destructiveOps: false,
        },
      },
    });
    expect((updated?.settings.mcp as any).enabled).toBe(false);
    expect((updated?.settings.mcp as any).allowedTools).toEqual(['MessageSendText']);
    await store.close();
  });

  test('adds and removes skills', async () => {
    const store = makeStore();
    await store.init();
    const agent = await store.createAgent({ name: 'Support' });

    const skill = await store.addSkill(agent.id, {
      name: 'Order lookup',
      description: 'Look up an order',
      instructions: 'Ask for the order number, then check the order table.',
    });
    expect(skill.enabled).toBe(true);
    expect(await store.listSkills(agent.id)).toHaveLength(1);
    expect(await store.deleteSkill(agent.id, skill.id)).toBe(true);
    expect(await store.listSkills(agent.id)).toHaveLength(0);
    await store.close();
  });

  test('stores knowledge sources', async () => {
    const store = makeStore();
    await store.init();
    const agent = await store.createAgent({ name: 'Support' });

    const source = await store.addKnowledge(agent.id, {
      name: 'Refund policy',
      kind: 'text',
      content: 'Refunds are processed within 5 working days.',
    });
    expect(source.status).toBe('pending');
    expect(await store.listKnowledge(agent.id)).toHaveLength(1);
    expect(await store.deleteKnowledge(agent.id, source.id)).toBe(true);
    await store.close();
  });

  test('stores model provider settings without returning the key', async () => {
    const store = makeStore();
    await store.init();

    const initial = await store.getModelSettings();
    expect(initial.provider).toBe('openai-compatible');
    expect(initial.hasApiKey).toBe(false);

    await store.updateModelSettings({
      provider: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'primary-key',
      model: 'primary-model',
      fallbackProvider: 'anthropic',
      fallbackBaseUrl: 'https://api.anthropic.com',
      fallbackApiKey: 'fallback-key',
      fallbackModel: 'fallback-model',
    });

    const saved = await store.getModelSettings();
    expect(saved.baseUrl).toBe('https://api.example.com/v1');
    expect(saved.model).toBe('primary-model');
    expect(saved.hasApiKey).toBe(true);
    expect(saved.fallbackProvider).toBe('anthropic');
    expect(saved.hasFallbackApiKey).toBe(true);
    expect(saved.fallbackModel).toBe('fallback-model');

    const secrets = await store.getModelSettingsSecrets();
    expect(secrets.apiKey).toBe('primary-key');
    expect(secrets.fallbackApiKey).toBe('fallback-key');

    // Omitting the key keeps the stored one.
    await store.updateModelSettings({ model: 'renamed-model' });
    const kept = await store.getModelSettingsSecrets();
    expect(kept.model).toBe('renamed-model');
    expect(kept.apiKey).toBe('primary-key');
    expect(kept.fallbackApiKey).toBe('fallback-key');
    await store.close();
  });

  test('probes primary and fallback models and reports plain errors', async () => {
    const results = await probeModelSettings({
      id: 'default',
      provider: 'openai-compatible',
      baseUrl: '',
      hasApiKey: false,
      model: '',
      apiKey: null,
      fallbackProvider: 'anthropic',
      fallbackBaseUrl: '',
      hasFallbackApiKey: false,
      fallbackModel: '',
      fallbackApiKey: null,
      updatedAt: new Date().toISOString(),
    });
    expect(results).toHaveLength(2);
    expect(results[0].served).toBe('primary');
    expect(results[0].ok).toBe(false);
    expect(results[1].served).toBe('fallback');
    expect(results[1].ok).toBe(false);
  });

  test('stores voice and call model settings separately', async () => {
    const store = makeStore();
    await store.init();

    const voice = await store.updateModelRoleSettings('voice', {
      provider: 'fish',
      baseUrl: 'https://api.fish.audio/v1',
      apiKey: 'fish-key',
      model: 's2.1-pro',
      fallbackProvider: 'elevenlabs',
      fallbackBaseUrl: 'https://api.elevenlabs.io/v1',
      fallbackApiKey: 'eleven-key',
      fallbackModel: 'flash',
    });
    expect(voice.role).toBe('voice');
    expect(voice.provider).toBe('fish');
    expect(voice.hasApiKey).toBe(true);
    expect(voice.fallbackProvider).toBe('elevenlabs');
    expect(voice.hasFallbackApiKey).toBe(true);

    const call = await store.updateModelRoleSettings('call', {
      provider: 'google',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: 'google-key',
      model: 'gemini-3.8-flash',
      fallbackProvider: 'openai-compatible',
      fallbackBaseUrl: 'https://api.openai.com/v1',
      fallbackApiKey: 'openai-key',
      fallbackModel: 'gpt-4o-mini',
    });
    expect(call.role).toBe('call');
    expect(call.provider).toBe('google');
    expect(call.fallbackProvider).toBe('openai-compatible');

    const roles = await store.listModelRoleSettings();
    expect(roles.map((role) => role.role).sort()).toEqual(['call', 'voice']);
    await store.close();
  });

  test('stores external MCP servers and their tools', async () => {
    const store = makeStore();
    await store.init();

    const server = await store.createExternalMcpServer({
      name: 'Notion',
      description: 'Workspace notes',
      url: 'https://mcp.notion.com/mcp',
      headers: { Authorization: 'Bearer demo' },
    });
    expect(server.name).toBe('Notion');
    expect(server.headers).toEqual({ Authorization: 'Bearer demo' });
    expect(server.enabled).toBe(true);

    const tools = await store.upsertExternalMcpTools(server.id, [
      {
        name: 'search_notes',
        description: 'Search workspace notes',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
        annotations: { readOnlyHint: true, destructiveHint: false },
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
    expect(tools.find((tool) => tool.name === 'create_note')?.destructive).toBe(true);

    const listed = await store.listExternalMcpTools();
    expect(listed).toHaveLength(2);

    const removed = await store.deleteExternalMcpServer(server.id);
    expect(removed).toBe(true);
    const after = await store.listExternalMcpTools();
    expect(after).toHaveLength(0);
    await store.close();
  });

  test('upserts a user profile with important details', async () => {
    const store = makeStore();
    await store.init();

    const first = await store.upsertUserProfile({
      userId: '233500000000@c.us',
      displayName: 'Ama',
      tags: ['vip'],
      importantDetails: { preferredPayment: 'MoMo' },
    });
    expect(first.displayName).toBe('Ama');
    expect(first.importantDetails.preferredPayment).toBe('MoMo');

    const second = await store.upsertUserProfile({
      userId: '233500000000@c.us',
      notes: 'Prefers evening calls',
    });
    expect(second.id).toBe(first.id);
    expect(second.displayName).toBe('Ama');
    expect(second.notes).toBe('Prefers evening calls');
    expect(second.tags).toEqual(['vip']);
    await store.close();
  });

  test('tracks conversations, reviews, and analytics events', async () => {
    const store = makeStore();
    await store.init();
    const agent = await store.createAgent({ name: 'Support' });
    const conversation = await store.createConversation({
      agentId: agent.id,
      userId: '233500000000@c.us',
      reviewEnabled: true,
    });
    expect(conversation.status).toBe('open');

    await store.recordEvent({
      type: 'conversation.started',
      agentId: agent.id,
      conversationId: conversation.id,
      userId: conversation.userId,
    });
    await store.setReviewRequested(conversation.id, new Date().toISOString());
    await store.submitReview(conversation.id, 5, 'Very helpful');
    const closed = await store.closeConversation(conversation.id);

    expect(closed?.status).toBe('closed');
    expect(closed?.reviewRating).toBe(5);
    expect(closed?.reviewText).toBe('Very helpful');
    expect(closed?.reviewRequestedAt).toBeTruthy();

    const events = await store.listEvents({ agentId: agent.id });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('conversation.started');
    await store.close();
  });
});
