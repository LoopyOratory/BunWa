import type { AgentStore } from './agent.store';
import { createAgentStore } from './agent.sql';
import type {
  Agent,
  AgentEngagement,
  AgentEngagementKind,
  AgentLiveNow,
  AgentSkill,
  AgentWithEngagement,
  AnalyticsEvent,
  Conversation,
  ConversationListFilter,
  ConversationMessage,
  ConversationPage,
  CreateAgentInput,
  CreateConversationInput,
  CreateConversationMessageInput,
  CreateExternalMcpServerInput,
  CreateKnowledgeInput,
  CreateSkillInput,
  CreateUserProfileFactInput,
  ExternalMcpServer,
  ExternalMcpTool,
  KnowledgeChunk,
  KnowledgeSearchHit,
  KnowledgeSource,
  ProfileContext,
  RecordEventInput,
  UpdateAgentInput,
  UpdateExternalMcpServerInput,
  UpdateUserProfileFactInput,
  UpsertExternalMcpToolInput,
  UpsertUserProfileSummaryInput,
  UpsertUserSegmentInput,
  UpsertUserProfileInput,
  UserProfile,
  UserProfileFact,
  UserProfileSummary,
  UserSegment,
} from './agent.types';
import { composePrompt, BUILDER_QUESTIONS, nextQuestion, type BuilderAnswers, type BuilderQuestion } from './agent.builder';
import { cache } from '../cache/redis-cache';
import { probeModelSettings } from './model-probe';
import { extractProfileFacts, type ProfileMessage } from './profile-extractor';
import { listExternalServerTools } from '../../mcp/external-mcp.client';
import { chunkText } from '../knowledge/chunk';
import { getEmbeddingProvider } from '../knowledge/embeddings';
import { readAttachment as readAttachmentWithSettings, type AttachmentInput, type AttachmentResult } from './attachment-reader';
import {
  computeAgentAnalytics,
  resolveAnalyticsWindow,
  type AgentAnalyticsDashboard,
  type AnalyticsChannel,
  type AnalyticsRangeKey,
} from './agent.analytics';
import type { ModelProbeResult, ModelRole, ModelRoleSettings, ModelSettings, UpdateModelRoleSettingsInput, UpdateModelSettingsInput, VisionSettings } from './agent.types';

let storePromise: Promise<AgentStore> | null = null;

async function getStore(): Promise<AgentStore> {
  storePromise ??= createAgentStore();
  return storePromise;
}

/** For tests: inject a store and reset it when done. */
export function setAgentStoreForTests(store: AgentStore | null): void {
  if (store) storePromise = Promise.resolve(store);
  else storePromise = null;
}

function compactProfileValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((item) => compactProfileValue(item)).filter(Boolean).join(', ');
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export class AgentService {
  async init(): Promise<void> {
    await getStore();
  }

  async close(): Promise<void> {
    const store = await getStore();
    await store.close();
    storePromise = null;
  }

  /* ─────────────────────────────────────────────────────────────────────
     Live engagement: "this agent is on a call / chatting right now".

     The runtime reports a heartbeat every ~5 s while an interaction is
     active. State is in-memory on purpose — a live call dies with the
     process, so a restart must not leave a stale "on call" row behind.
     Entries older than the TTL prune on every read, so a crashed runtime
     heals itself within 15 s instead of lying forever.
     ───────────────────────────────────────────────────────────────────── */

  /** A missed heartbeat window after which an interaction is no longer live. */
  static readonly ENGAGEMENT_TTL_MS = 15_000;

  private engagements = new Map<string, AgentEngagement>();
  private engagementListeners = new Set<(change: { agentId: string; engaged: AgentEngagement | null }) => void>();

  /** Subscribe to live-interaction changes; returns an unsubscribe fn. */
  onEngagementChange(
    listener: (change: { agentId: string; engaged: AgentEngagement | null }) => void,
  ): () => void {
    this.engagementListeners.add(listener);
    return () => this.engagementListeners.delete(listener);
  }

  private notifyEngagementChange(agentId: string, engaged: AgentEngagement | null): void {
    for (const listener of this.engagementListeners) {
      try {
        listener({ agentId, engaged });
      } catch {
        // A broken listener must never break the heartbeat path.
      }
    }
  }

  /**
   * Record one interaction heartbeat. `active: true` upserts (preserving
   * `since` while the kind is unchanged); `active: false` ends it. Every
   * call prunes entries whose last beat is older than the TTL.
   */
  reportActivity(
    agentId: string,
    input: { kind: AgentEngagementKind; active: boolean; conversationId?: string | null; contact?: string | null },
    now: number = Date.now(),
  ): AgentEngagement | null {
    if (input.kind !== 'voice' && input.kind !== 'chat') {
      throw new Error('kind must be "voice" or "chat"');
    }
    this.pruneEngagements(now);
    if (!input.active) {
      if (this.engagements.delete(agentId)) this.notifyEngagementChange(agentId, null);
      return null;
    }
    const previous = this.engagements.get(agentId);
    const engaged: AgentEngagement = {
      kind: input.kind,
      conversationId: typeof input.conversationId === 'string' && input.conversationId ? input.conversationId : null,
      contact: typeof input.contact === 'string' && input.contact ? input.contact.slice(0, 120) : null,
      since: previous && previous.kind === input.kind ? previous.since : new Date(now).toISOString(),
      lastBeatAt: new Date(now).toISOString(),
    };
    this.engagements.set(agentId, engaged);
    this.notifyEngagementChange(agentId, engaged);
    return engaged;
  }

  /** Every live interaction, oldest heartbeat pruned first. */
  listEngagements(now: number = Date.now()): Array<{ agentId: string; engaged: AgentEngagement }> {
    this.pruneEngagements(now);
    return [...this.engagements.entries()].map(([agentId, engaged]) => ({ agentId, engaged }));
  }

  /** Drop interactions whose last heartbeat missed the TTL window. */
  private pruneEngagements(now: number = Date.now()): void {
    const ttl = AgentService.ENGAGEMENT_TTL_MS;
    for (const [agentId, engaged] of this.engagements) {
      if (now - Date.parse(engaged.lastBeatAt) > ttl) {
        this.engagements.delete(agentId);
        this.notifyEngagementChange(agentId, null);
      }
    }
  }

  /**
   * Agents with their live interaction attached. A paused agent never shows
   * as live: pausing means the operator stopped it, so a stale runtime
   * heartbeat must not resurrect an "on call" badge on the roster.
   */
  async listAgentsWithEngagement(): Promise<AgentWithEngagement[]> {
    const agents = await this.listAgents();
    this.pruneEngagements();
    return agents.map((agent) => ({
      ...agent,
      engaged: agent.status === 'paused' ? null : this.engagements.get(agent.id) ?? null,
    }));
  }

  /** Dashboard snapshot: counts plus which agents are busy right now. */
  liveNowSnapshot(agents: Agent[], agentId?: string | null): AgentLiveNow {
    this.pruneEngagements();
    const byId = new Map(agents.map((agent) => [agent.id, agent] as const));
    const live = this.listEngagements()
      .filter((entry) => (agentId ? entry.agentId === agentId : true))
      .map((entry) => {
        const agent = byId.get(entry.agentId);
        return {
          id: entry.agentId,
          name: agent?.name ?? 'Unknown agent',
          kind: entry.engaged.kind,
          conversationId: entry.engaged.conversationId,
          contact: entry.engaged.contact,
          since: entry.engaged.since,
          lastBeatAt: entry.engaged.lastBeatAt,
        };
      });
    return {
      count: live.length,
      voice: live.filter((entry) => entry.kind === 'voice').length,
      chat: live.filter((entry) => entry.kind === 'chat').length,
      agents: live,
    };
  }

  builderQuestions(): BuilderQuestion[] {
    return BUILDER_QUESTIONS;
  }

  builderNext(answers: BuilderAnswers): BuilderQuestion | null {
    return nextQuestion(answers);
  }

  builderPrompt(answers: BuilderAnswers): string {
    return composePrompt(answers);
  }

  async createAgent(input: CreateAgentInput): Promise<Agent> {
    const store = await getStore();
    const agent = await store.createAgent(input);
    await cache.del('bunwa:agents:analytics:all');
    return agent;
  }

  async listAgents(): Promise<Agent[]> {
    return (await getStore()).listAgents();
  }

  async getAgent(id: string): Promise<Agent | null> {
    return (await getStore()).getAgent(id);
  }

  async updateAgent(id: string, input: UpdateAgentInput): Promise<Agent | null> {
    const agent = await (await getStore()).updateAgent(id, input);
    await cache.del('bunwa:agents:analytics:all');
    await cache.del(`bunwa:agents:analytics:${id}`);
    return agent;
  }

  async deleteAgent(id: string): Promise<boolean> {
    const removed = await (await getStore()).deleteAgent(id);
    await cache.del('bunwa:agents:analytics:all');
    await cache.del(`bunwa:agents:analytics:${id}`);
    // A deleted agent cannot be interacting with anyone.
    if (this.engagements.delete(id)) this.notifyEngagementChange(id, null);
    return removed;
  }

  async getModelSettings(): Promise<ModelSettings> {
    return (await getStore()).getModelSettings();
  }

  async updateModelSettings(input: UpdateModelSettingsInput): Promise<ModelSettings> {
    return (await getStore()).updateModelSettings(input);
  }

  async testModelSettings(): Promise<ModelProbeResult[]> {
    const settings = await (await getStore()).getModelSettingsSecrets();
    return probeModelSettings(settings);
  }

  async listModelRoleSettings(): Promise<ModelRoleSettings[]> {
    return (await getStore()).listModelRoleSettings();
  }

  async getModelRoleSettings(role: ModelRole): Promise<ModelRoleSettings> {
    return (await getStore()).getModelRoleSettings(role);
  }

  async updateModelRoleSettings(role: ModelRole, input: UpdateModelRoleSettingsInput): Promise<ModelRoleSettings> {
    return (await getStore()).updateModelRoleSettings(role, input);
  }

  /**
   * The model used to read images. A dedicated `vision` role wins when it has a
   * model and key; otherwise the chat model is used, which is right for
   * Gemini/GPT-4o/Claude setups and keeps a single-model install working.
   */
  async getVisionSettings(): Promise<VisionSettings> {
    const store = await getStore();
    const chat = await store.getModelSettingsSecrets();
    const role = await store.getModelRoleSettingsSecrets('vision').catch(() => null);
    if (role?.model.trim() && role.apiKey) {
      return {
        provider: role.provider,
        baseUrl: role.baseUrl,
        apiKey: role.apiKey,
        model: role.model,
        fallbackProvider: role.fallbackProvider,
        fallbackBaseUrl: role.fallbackBaseUrl,
        fallbackApiKey: role.fallbackApiKey,
        fallbackModel: role.fallbackModel,
      };
    }
    return {
      provider: chat.provider,
      baseUrl: chat.baseUrl,
      apiKey: chat.apiKey,
      model: chat.model,
      fallbackProvider: chat.fallbackProvider,
      fallbackBaseUrl: chat.fallbackBaseUrl,
      fallbackApiKey: chat.fallbackApiKey,
      fallbackModel: chat.fallbackModel,
    };
  }

  /** Read a document or image with the configured vision/chat model. */
  async readAttachment(input: AttachmentInput): Promise<AttachmentResult> {
    const settings = await this.getVisionSettings();
    return readAttachmentWithSettings(input, { settings });
  }

  async createExternalMcpServer(input: CreateExternalMcpServerInput): Promise<ExternalMcpServer> {
    return (await getStore()).createExternalMcpServer(input);
  }

  async listExternalMcpServers(): Promise<ExternalMcpServer[]> {
    return (await getStore()).listExternalMcpServers();
  }

  async getExternalMcpServer(id: string): Promise<ExternalMcpServer | null> {
    return (await getStore()).getExternalMcpServer(id);
  }

  async updateExternalMcpServer(id: string, input: UpdateExternalMcpServerInput): Promise<ExternalMcpServer | null> {
    return (await getStore()).updateExternalMcpServer(id, input);
  }

  async markExternalMcpServerRefresh(
    id: string,
    input: { refreshedAt?: string; error?: string | null },
  ): Promise<ExternalMcpServer | null> {
    return (await getStore()).markExternalMcpServerRefresh(id, input);
  }

  async deleteExternalMcpServer(id: string): Promise<boolean> {
    const store = await getStore();
    const tools = await store.listExternalMcpToolsForServer(id);
    await this.pruneExternalToolRefs(new Set(tools.flatMap((tool) => [tool.qualifiedName, tool.name]))).catch(() => {});
    return store.deleteExternalMcpServer(id);
  }

  async listExternalMcpTools(): Promise<ExternalMcpTool[]> {
    return (await getStore()).listExternalMcpTools();
  }

  async upsertExternalMcpTools(serverId: string, tools: UpsertExternalMcpToolInput[]): Promise<ExternalMcpTool[]> {
    return (await getStore()).upsertExternalMcpTools(serverId, tools);
  }

  /** Connect to a remote MCP server and cache its tool list in the store. */
  async refreshExternalMcpServerTools(serverId: string): Promise<ExternalMcpTool[]> {
    const store = await getStore();
    const server = await store.getExternalMcpServer(serverId);
    if (!server) return [];

    const previous = await store.listExternalMcpToolsForServer(serverId);
    try {
      const tools = await listExternalServerTools(server);
      // A transient empty response must not wipe a working catalogue.
      if (tools.length === 0 && previous.length > 0) {
        throw new Error('Server returned no tools; keeping the cached catalogue');
      }
      const saved = await store.upsertExternalMcpTools(serverId, tools);
      await store.markExternalMcpServerRefresh(serverId, {
        refreshedAt: new Date().toISOString(),
        error: null,
      });

      // Drop allowlist entries for tools this server no longer exposes. Keep
      // the remote name too: older agent settings stored the unqualified name.
      const keep = new Set(saved.map((tool) => tool.qualifiedName));
      const removed = new Set<string>();
      for (const tool of previous) {
        if (!keep.has(tool.qualifiedName)) {
          removed.add(tool.qualifiedName);
          removed.add(tool.name);
        }
      }
      await this.pruneExternalToolRefs(removed).catch(() => {});
      return saved;
    } catch (error) {
      await store.markExternalMcpServerRefresh(serverId, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Remove dead external tool names from every agent's MCP allowlist/denylist.
   * Best effort: a stale name must never block a server refresh or delete.
   */
  private async pruneExternalToolRefs(removed: Set<string>): Promise<void> {
    if (removed.size === 0) return;
    const store = await getStore();
    const agents = await store.listAgents();
    for (const agent of agents) {
      const mcp = agent.settings?.mcp as Record<string, unknown> | undefined;
      if (!mcp) continue;
      const allowed = Array.isArray(mcp.allowedTools) ? mcp.allowedTools.map(String) : [];
      const denied = Array.isArray(mcp.deniedTools) ? mcp.deniedTools.map(String) : [];
      const nextAllowed = allowed.filter((name) => !removed.has(name));
      const nextDenied = denied.filter((name) => !removed.has(name));
      if (nextAllowed.length === allowed.length && nextDenied.length === denied.length) continue;
      await store.updateAgent(agent.id, {
        settings: {
          ...agent.settings,
          mcp: { ...mcp, allowedTools: nextAllowed, deniedTools: nextDenied },
        },
      });
    }
  }

  async addSkill(agentId: string, input: CreateSkillInput): Promise<AgentSkill> {
    return (await getStore()).addSkill(agentId, input);
  }

  async listSkills(agentId: string): Promise<AgentSkill[]> {
    return (await getStore()).listSkills(agentId);
  }

  async deleteSkill(agentId: string, skillId: string): Promise<boolean> {
    return (await getStore()).deleteSkill(agentId, skillId);
  }

  async addKnowledge(agentId: string, input: CreateKnowledgeInput): Promise<KnowledgeSource> {
    const text = input.content.trim();
    if (!text) throw new Error('Knowledge content cannot be empty.');
    const provider = getEmbeddingProvider();
    const store = await getStore();
    const source = await store.addKnowledge(agentId, {
      ...input,
      content: text,
      metadata: input.metadata ?? {},
    });
    await store.updateKnowledgeStatus(source.id, {
      status: 'processing',
      embeddingModel: provider.model,
      chunkCount: 0,
      error: null,
    });

    try {
      const chunks = chunkText(text);
      if (!chunks.length) throw new Error('The document did not produce any usable chunks.');
      const vectors = await provider.embed(chunks.map((chunk) => chunk.text), 'document');
      if (vectors.length !== chunks.length) {
        throw new Error('The embedding model returned the wrong number of vectors.');
      }
      await store.addKnowledgeChunks(
        chunks.map((chunk, index) => ({
          sourceId: source.id,
          agentId,
          index: chunk.index,
          text: chunk.text,
          charCount: chunk.charCount,
          tokenCount: chunk.tokenCount,
          embedding: vectors[index],
          embeddingModel: provider.model,
        })),
      );
      return (
        (await store.updateKnowledgeStatus(source.id, {
          status: 'ready',
          embeddingModel: provider.model,
          chunkCount: chunks.length,
          error: null,
        })) ?? source
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await store.updateKnowledgeStatus(source.id, {
        status: 'error',
        embeddingModel: provider.model,
        chunkCount: 0,
        error: message.slice(0, 500),
      });
      throw error;
    }
  }

  async listKnowledge(agentId: string): Promise<KnowledgeSource[]> {
    return (await getStore()).listKnowledge(agentId);
  }

  async listKnowledgeChunks(agentId: string, sourceId: string): Promise<KnowledgeChunk[]> {
    return (await getStore()).listKnowledgeChunks(agentId, sourceId);
  }

  async searchKnowledge(agentId: string, query: string, limit = 4): Promise<KnowledgeSearchHit[]> {
    const text = query.trim();
    if (!text) return [];
    const provider = getEmbeddingProvider();
    const [vector] = await provider.embed([text], 'query');
    if (!vector?.length) return [];
    return (await getStore()).searchKnowledge(agentId, vector, provider.model, Math.max(1, Math.min(limit, 20)));
  }

  async deleteKnowledge(agentId: string, sourceId: string): Promise<boolean> {
    return (await getStore()).deleteKnowledge(agentId, sourceId);
  }

  async getUserProfile(userId: string): Promise<UserProfile | null> {
    return (await getStore()).getUserProfile(userId);
  }

  async upsertUserProfile(input: UpsertUserProfileInput): Promise<UserProfile> {
    return (await getStore()).upsertUserProfile(input);
  }

  async listUserProfiles(limit = 100): Promise<UserProfile[]> {
    return (await getStore()).listUserProfiles(limit);
  }

  /** Extract and persist durable profile facts from a conversation. */
  async extractUserProfileFacts(userId: string, messages: ProfileMessage[]): Promise<UserProfileFact[]> {
    const settings = await (await getStore()).getModelSettingsSecrets();
    const existing = await this.listUserProfileFacts(userId);
    const extracted = await extractProfileFacts(settings, existing, messages);
    const saved: UserProfileFact[] = [];
    for (const fact of extracted) {
      saved.push(
        await this.createUserProfileFact({
          userId,
          kind: fact.kind,
          key: fact.key,
          value: fact.value,
          confidence: fact.confidence,
          source: 'extraction',
          evidence: fact.evidence,
          sensitivity: fact.sensitivity,
        }),
      );
    }
    return saved;
  }

  async listUserProfileFacts(userId: string, includeInactive = false): Promise<UserProfileFact[]> {
    return (await getStore()).listUserProfileFacts(userId, includeInactive);
  }

  async createUserProfileFact(input: CreateUserProfileFactInput): Promise<UserProfileFact> {
    return (await getStore()).createUserProfileFact(input);
  }

  async updateUserProfileFact(id: string, input: UpdateUserProfileFactInput): Promise<UserProfileFact | null> {
    return (await getStore()).updateUserProfileFact(id, input);
  }

  async deleteUserProfileFact(id: string): Promise<boolean> {
    return (await getStore()).deleteUserProfileFact(id);
  }

  async getUserProfileSummary(userId: string): Promise<UserProfileSummary | null> {
    return (await getStore()).getUserProfileSummary(userId);
  }

  async upsertUserProfileSummary(input: UpsertUserProfileSummaryInput): Promise<UserProfileSummary> {
    return (await getStore()).upsertUserProfileSummary(input);
  }

  async listUserSegments(userId: string): Promise<UserSegment[]> {
    return (await getStore()).listUserSegments(userId);
  }

  async upsertUserSegment(input: UpsertUserSegmentInput): Promise<UserSegment> {
    return (await getStore()).upsertUserSegment(input);
  }

  async deleteUserSegment(id: string): Promise<boolean> {
    return (await getStore()).deleteUserSegment(id);
  }

  async buildProfileContext(userId: string, options: { includeSensitive?: boolean } = {}): Promise<ProfileContext | null> {
    return (await getStore()).buildProfileContext(userId, options);
  }

  /** Build a compact, inspectable summary from the active profile facts. */
  async summarizeUserProfile(userId: string): Promise<UserProfileSummary | null> {
    const context = await this.buildProfileContext(userId);
    if (!context) return null;
    const parts: string[] = [];
    if (context.profile.displayName) parts.push(`Name: ${context.profile.displayName}`);
    if (context.profile.tags.length) parts.push(`Tags: ${context.profile.tags.join(', ')}`);
    for (const fact of context.facts) {
      const value = compactProfileValue(fact.value);
      if (value) parts.push(`${fact.kind}: ${fact.key}=${value}`);
    }
    for (const segment of context.segments) {
      parts.push(`${segment.segmentType}: ${segment.segmentValue}`);
    }
    const summary = parts.join('; ');
    return this.upsertUserProfileSummary({
      userId,
      summary,
      sourceFactIds: context.facts.map((fact) => fact.id),
      model: 'profile-context',
    });
  }

  async createConversation(input: CreateConversationInput): Promise<Conversation> {
    return (await getStore()).createConversation(input);
  }

  async getConversation(id: string): Promise<Conversation | null> {
    return (await getStore()).getConversation(id);
  }

  async listConversations(filter: {
    agentId?: string;
    channel?: string;
    status?: string;
    from?: string;
    to?: string;
    limit?: number;
  } = {}): Promise<Conversation[]> {
    return (await getStore()).listConversations(filter);
  }

  async listConversationSummaries(filter: ConversationListFilter = {}): Promise<ConversationPage> {
    return (await getStore()).listConversationSummaries(filter);
  }

  async addConversationMessage(input: CreateConversationMessageInput): Promise<ConversationMessage> {
    if (!input.text.trim()) throw new Error('Message text is required');
    if (!['customer', 'agent', 'system', 'tool'].includes(input.role)) throw new Error('Invalid message role');
    return (await getStore()).addConversationMessage({ ...input, text: input.text.slice(0, 20_000) });
  }

  async listConversationMessages(
    conversationId: string,
    filter: { limit?: number; before?: string; after?: string } = {},
  ): Promise<ConversationMessage[]> {
    return (await getStore()).listConversationMessages(conversationId, filter);
  }

  async closeConversation(id: string): Promise<Conversation | null> {
    return (await getStore()).closeConversation(id);
  }

  async setReviewRequested(id: string): Promise<Conversation | null> {
    return (await getStore()).setReviewRequested(id, new Date().toISOString());
  }

  async submitReview(id: string, rating: number, text?: string): Promise<Conversation | null> {
    return (await getStore()).submitReview(id, rating, text);
  }

  async recordEvent(input: RecordEventInput): Promise<AnalyticsEvent> {
    const event = await (await getStore()).recordEvent(input);
    await cache.del('bunwa:agents:analytics:all');
    if (input.agentId) await cache.del(`bunwa:agents:analytics:${input.agentId}`);
    return event;
  }

  async listEvents(filter?: { agentId?: string; conversationId?: string; type?: string; limit?: number }): Promise<AnalyticsEvent[]> {
    return (await getStore()).listEvents(filter);
  }

  /** Compose the prompt the runtime should use, including enabled skills and an optional user profile. */
  async effectivePrompt(agentId: string, userId?: string, query?: string): Promise<string | null> {
    const agent = await this.getAgent(agentId);
    if (!agent) return null;
    const skills = (await this.listSkills(agentId)).filter((skill) => skill.enabled);
    const lines = [agent.prompt];
    if (skills.length) {
      lines.push('', '## Skills');
      for (const skill of skills) {
        lines.push('', `### ${skill.name}`);
        if (skill.description) lines.push(skill.description);
        if (skill.instructions) lines.push(skill.instructions);
      }
    }
    if (query?.trim()) {
      const hits = await this.searchKnowledge(agentId, query, 4).catch(() => []);
      if (hits.length) {
        lines.push('', '## Knowledge', 'Use these passages when they answer the question. Do not invent details beyond them.');
        for (const hit of hits) {
          lines.push('', `### ${hit.sourceName} · chunk ${hit.index + 1}`);
          lines.push(hit.text);
        }
      }
    }
    if (userId) {
      const profile = await this.buildProfileContext(userId);
      if (profile) {
        lines.push('', '## User profile', 'Use this only to adapt tone, channel, and next steps. Do not invent facts or treat it as a script.', profile.text);
      }
    }
    return lines.join('\n');
  }

  /** Full dashboard payload: KPIs, series, funnel, leaderboard, attention, topics, tools. */
  async analyticsDashboard(input: {
    range: AnalyticsRangeKey;
    agentId?: string | null;
    channel: AnalyticsChannel;
    from?: string | null;
    to?: string | null;
  }, storeOverride?: AgentStore): Promise<AgentAnalyticsDashboard> {
    const store = storeOverride ?? (await getStore());
    const window = resolveAnalyticsWindow(input.range, input.from, input.to);
    const channel = input.channel === 'all' ? undefined : input.channel;
    const agentId = input.agentId || undefined;
    const [agents, conversations, events, previousConversations, previousEvents] = await Promise.all([
      store.listAgents(),
      store.listConversations({ agentId, channel, from: window.from, to: window.to }),
      store.listEventsForAnalytics({ agentId, from: window.from, to: window.to }),
      store.listConversations({ agentId, channel, from: window.previousFrom, to: window.previousTo }),
      store.listEventsForAnalytics({ agentId, from: window.previousFrom, to: window.previousTo }),
    ]);
    const dashboard = computeAgentAnalytics({
      agents,
      conversations,
      events,
      previousConversations,
      previousEvents,
      window,
      agentId: agentId ?? null,
      channel: input.channel,
    });
    // liveNow is instantaneous state, not a period metric: it rides on the
    // dashboard payload so one request answers both "how did we do" and
    // "who is busy right now".
    return { ...dashboard, liveNow: this.liveNowSnapshot(agents, agentId ?? null) };
  }

  /** Aggregated counters for the admin dashboard. Cached for 10 seconds. */
  async analytics(agentId?: string): Promise<{
    agents: number;
    conversations: number;
    closedConversations: number;
    reviews: number;
    averageRating: number | null;
    conversions: number;
    conversionRate: number | null;
    events: Array<{ type: string; count: number }>;
  }> {
    return cache.wrap(`bunwa:agents:analytics:${agentId ?? 'all'}`, 10, () => this.computeAnalytics(agentId));
  }

  private async computeAnalytics(agentId?: string): Promise<{
    agents: number;
    conversations: number;
    closedConversations: number;
    reviews: number;
    averageRating: number | null;
    conversions: number;
    conversionRate: number | null;
    events: Array<{ type: string; count: number }>;
  }> {
    const agents = await this.listAgents();
    const store = await getStore();
    const events = await store.listEvents({ agentId, limit: 1000 });
    const conversations = await Promise.all(
      events
        .filter((event) => event.type === 'conversation.started')
        .map((event) => event.conversationId)
        .filter((id): id is string => Boolean(id))
        .map((id) => store.getConversation(id)),
    );
    const unique = new Map<string, Conversation>();
    for (const conversation of conversations) {
      if (conversation) unique.set(conversation.id, conversation);
    }
    const all = [...unique.values()];
    const closed = all.filter((conversation) => conversation.status === 'closed');
    const rated = all.filter((conversation) => typeof conversation.reviewRating === 'number');
    const counts = new Map<string, number>();
    for (const event of events) counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
    const conversions = (counts.get('conversion') ?? 0) + (counts.get('conversion.completed') ?? 0);
    return {
      agents: agents.length,
      conversations: all.length,
      closedConversations: closed.length,
      reviews: rated.length,
      averageRating: rated.length
        ? rated.reduce((sum, conversation) => sum + (conversation.reviewRating ?? 0), 0) / rated.length
        : null,
      conversions,
      conversionRate: all.length ? conversions / all.length : null,
      events: [...counts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    };
  }
}

export const agentService = new AgentService();
