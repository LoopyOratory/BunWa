import type { AgentStore } from './agent.store';
import { createAgentStore } from './agent.sql';
import type {
  Agent,
  AgentSkill,
  AnalyticsEvent,
  Conversation,
  CreateAgentInput,
  CreateConversationInput,
  CreateExternalMcpServerInput,
  CreateKnowledgeInput,
  CreateSkillInput,
  CreateUserProfileFactInput,
  ExternalMcpServer,
  ExternalMcpTool,
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
import type { ModelProbeResult, ModelRole, ModelRoleSettings, ModelSettings, UpdateModelRoleSettingsInput, UpdateModelSettingsInput } from './agent.types';

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

  async deleteExternalMcpServer(id: string): Promise<boolean> {
    return (await getStore()).deleteExternalMcpServer(id);
  }

  async listExternalMcpTools(): Promise<ExternalMcpTool[]> {
    return (await getStore()).listExternalMcpTools();
  }

  async upsertExternalMcpTools(serverId: string, tools: UpsertExternalMcpToolInput[]): Promise<ExternalMcpTool[]> {
    return (await getStore()).upsertExternalMcpTools(serverId, tools);
  }

  /** Connect to a remote MCP server and cache its tool list in the store. */
  async refreshExternalMcpServerTools(serverId: string): Promise<ExternalMcpTool[]> {
    const server = await (await getStore()).getExternalMcpServer(serverId);
    if (!server) return [];
    const tools = await listExternalServerTools(server);
    return (await getStore()).upsertExternalMcpTools(serverId, tools);
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
    return (await getStore()).addKnowledge(agentId, input);
  }

  async listKnowledge(agentId: string): Promise<KnowledgeSource[]> {
    return (await getStore()).listKnowledge(agentId);
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
  async effectivePrompt(agentId: string, userId?: string): Promise<string | null> {
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
    if (userId) {
      const profile = await this.buildProfileContext(userId);
      if (profile) {
        lines.push('', '## User profile', 'Use this only to adapt tone, channel, and next steps. Do not invent facts or treat it as a script.', profile.text);
      }
    }
    return lines.join('\n');
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
