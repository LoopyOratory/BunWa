import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { BunSqliteClient, SqlAgentStore } from '../core/agent/agent.sql';
import { composePrompt, nextQuestion, isComplete } from '../core/agent/agent.builder';
import { probeModelSettings } from '../core/agent/model-probe';
import { AgentService, setAgentStoreForTests } from '../core/agent/agent.service';
import { setEmbeddingProvider } from '../core/knowledge/embeddings';

process.env.BUNWA_KEY_ENCRYPTION_SECRET ??= 'test-secret';

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
    if (!updated) throw new Error('updateAgent returned null');
    expect((updated.settings as any).mcp.enabled).toBe(false);
    expect((updated.settings as any).mcp.allowedTools).toEqual(['MessageSendText']);
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

  test('uses the vision role when configured and falls back to the chat model', async () => {
    const store = makeStore();
    await store.init();
    const service = new AgentService();
    setAgentStoreForTests(store);

    await store.updateModelSettings({
      provider: 'openai-compatible',
      baseUrl: 'https://chat.example/v1',
      apiKey: 'chat-key',
      model: 'chat-model',
      fallbackProvider: 'openai-compatible',
      fallbackBaseUrl: 'https://fallback.example/v1',
      fallbackApiKey: 'fallback-key',
      fallbackModel: 'fallback-model',
    });

    const fromChat = await service.getVisionSettings();
    expect(fromChat.model).toBe('chat-model');
    expect(fromChat.apiKey).toBe('chat-key');

    await store.updateModelRoleSettings('vision', {
      provider: 'google',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: 'vision-key',
      model: 'gemini-3.8-flash',
      fallbackProvider: 'openai-compatible',
      fallbackBaseUrl: 'https://vision-fallback.example/v1',
      fallbackApiKey: 'vision-fallback-key',
      fallbackModel: 'vision-fallback',
    });

    const fromVision = await service.getVisionSettings();
    expect(fromVision.provider).toBe('google');
    expect(fromVision.model).toBe('gemini-3.8-flash');
    expect(fromVision.apiKey).toBe('vision-key');

    setAgentStoreForTests(null);
    await store.close();
  });

  test('builds a dashboard from stored conversations and events', async () => {
    const store = makeStore();
    await store.init();
    const service = new AgentService();

    const agent = await store.createAgent({ name: 'Analytics agent', status: 'active' });
    const conversation = await store.createConversation({ agentId: agent.id, userId: '233500000000@c.us' });
    await store.recordEvent({ type: 'conversation.started', agentId: agent.id, conversationId: conversation.id });
    await store.recordEvent({
      type: 'conversion',
      agentId: agent.id,
      conversationId: conversation.id,
      data: { valueCents: 25000, currency: 'GHS' },
    });
    await store.closeConversation(conversation.id);
    await store.setReviewRequested(conversation.id, new Date().toISOString());
    await store.submitReview(conversation.id, 5, 'Quick and clear');

    const dashboard = await service.analyticsDashboard({ range: '7d', channel: 'all' }, store);
    expect(dashboard.totals.conversations).toBe(1);
    expect(dashboard.totals.converted).toBe(1);
    expect(dashboard.totals.averageRating).toBe(5);
    expect(dashboard.currency).toBe('GHS');
    expect(dashboard.leaderboard[0].agentName).toBe('Analytics agent');
    expect(dashboard.recentConversations[0].outcome).toBe('converted');

    setAgentStoreForTests(null);
    await store.close();
  });

  test('stores transcript messages and summarizes conversations', async () => {
    const store = makeStore();
    await store.init();
    const agent = await store.createAgent({ name: 'Chat agent', status: 'active' });
    const conversation = await store.createConversation({
      agentId: agent.id,
      userId: '233500000000@c.us',
      metadata: { contactName: 'Ama Mensah', phone: '+233 50 000 0000' },
    });
    await store.addConversationMessage({
      conversationId: conversation.id,
      agentId: agent.id,
      userId: conversation.userId,
      role: 'customer',
      text: 'Do you deliver to Kumasi?',
      createdAt: '2026-11-19T10:00:00.000Z',
    });
    await store.addConversationMessage({
      conversationId: conversation.id,
      agentId: agent.id,
      userId: conversation.userId,
      role: 'agent',
      text: 'Yes, delivery to Kumasi is GH₵40.',
      createdAt: '2026-11-19T10:00:08.000Z',
    });

    const page = await store.listConversationSummaries({ agentId: agent.id, q: 'Kumasi' });
    expect(page.total).toBe(1);
    expect(page.conversations[0].messageCount).toBe(2);
    expect(page.conversations[0].lastMessage).toContain('GH₵40');
    expect(page.conversations[0].lastMessageRole).toBe('agent');
    expect(page.conversations[0].contactName).toBe('Ama Mensah');
    expect(page.conversations[0].messageCount).toBe(2);

    const messages = await store.listConversationMessages(conversation.id);
    expect(messages.map((message) => message.role)).toEqual(['customer', 'agent']);

    const after = await store.listConversationMessages(conversation.id, { after: '2026-11-19T10:00:05.000Z' });
    expect(after).toHaveLength(1);
    expect(after[0].role).toBe('agent');

    const empty = await store.listConversationSummaries({ agentId: agent.id, q: 'not in this transcript' });
    expect(empty.total).toBe(0);
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

  test('appends the user profile block to the effective prompt', async () => {
    const store = makeStore();
    await store.init();
    setAgentStoreForTests(store);
    const service = new AgentService();
    const agent = await service.createAgent({ name: 'Support', prompt: 'You are Support.' });
    await service.upsertUserProfile({ userId: '233500000000@c.us', displayName: 'Ama' });
    await service.createUserProfileFact({
      userId: '233500000000@c.us',
      kind: 'communication',
      key: 'tone',
      value: 'concise',
      confidence: 0.9,
    });

    const prompt = await service.effectivePrompt(agent.id, '233500000000@c.us');
    expect(prompt).toContain('You are Support.');
    expect(prompt).toContain('## User profile');
    expect(prompt).toContain('<user_profile>');
    expect(prompt).toContain('Communication: tone=concise.');
    expect((await service.effectivePrompt(agent.id))?.includes('<user_profile>')).toBe(false);

    setAgentStoreForTests(null);
    await store.close();
  });

  test('indexes knowledge into chunks and retrieves the matching passage', async () => {
    const store = makeStore();
    await store.init();
    setAgentStoreForTests(store);
    const vector = Array.from({ length: 384 }, (_, index) => (index === 0 ? 1 : 0));
    setEmbeddingProvider({
      model: 'test-embed',
      dimensions: 384,
      embed: async (texts) => texts.map(() => vector),
    });

    const service = new AgentService();
    const agent = await service.createAgent({ name: 'RAG', prompt: 'Answer from the knowledge base.' });
    const source = await service.addKnowledge(agent.id, {
      name: 'Refund policy',
      kind: 'text',
      content: 'Refunds take five working days. Send the order number with the request.',
    });
    expect(source.status).toBe('ready');
    expect(source.chunkCount).toBeGreaterThan(0);

    const chunks = await service.listKnowledgeChunks(agent.id, source.id);
    expect(chunks).toHaveLength(source.chunkCount);
    expect(chunks[0].text).toContain('Refunds take five working days');

    const hits = await service.searchKnowledge(agent.id, 'refund', 2);
    expect(hits).toHaveLength(1);
    expect(hits[0].text).toContain('Refunds take five working days');

    const prompt = await service.effectivePrompt(agent.id, undefined, 'refund');
    expect(prompt).toContain('## Knowledge');
    expect(prompt).toContain('Refunds take five working days');

    expect(await service.deleteKnowledge(agent.id, source.id)).toBe(true);
    expect(await service.listKnowledgeChunks(agent.id, source.id)).toHaveLength(0);

    setEmbeddingProvider(undefined);
    setAgentStoreForTests(null);
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
