/**
 * Agent domain types.
 *
 * These are deliberately storage-agnostic. The SQL store serialises the
 * flexible fields (settings, tags, metadata) as JSON text so the same schema
 * works on Postgres and SQLite.
 */

export type AgentStatus = 'draft' | 'active' | 'paused';

export interface Agent {
  id: string;
  name: string;
  status: AgentStatus;
  prompt: string;
  model: string | null;
  fallbackModel: string | null;
  voice: string | null;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type AgentEngagementKind = 'voice' | 'chat';

/**
 * Ephemeral "this agent is interacting with someone right now" state.
 * Derived from runtime heartbeats — never persisted: a live call dies with
 * the process, so restarts must leave no stale "on call" rows behind.
 */
export interface AgentEngagement {
  kind: AgentEngagementKind;
  conversationId: string | null;
  contact: string | null;
  /** ISO timestamp of the first heartbeat of the current interaction. */
  since: string;
  /** ISO timestamp of the latest heartbeat; entries prune after a TTL. */
  lastBeatAt: string;
}

/** An agent as the API serves it, with its live interaction attached. */
export interface AgentWithEngagement extends Agent {
  engaged: AgentEngagement | null;
}

/** Snapshot of every live interaction, for dashboards and streams. */
export interface AgentLiveNow {
  count: number;
  voice: number;
  chat: number;
  agents: Array<{
    id: string;
    name: string;
    kind: AgentEngagementKind;
    conversationId: string | null;
    contact: string | null;
    since: string;
    lastBeatAt: string;
  }>;
}

export interface AgentSkill {
  id: string;
  agentId: string;
  name: string;
  description: string;
  instructions: string;
  enabled: boolean;
  createdAt: string;
}

export type KnowledgeKind = 'text' | 'url' | 'file';
export type KnowledgeStatus = 'pending' | 'processing' | 'ready' | 'error';

export interface KnowledgeSource {
  id: string;
  agentId: string;
  name: string;
  kind: KnowledgeKind;
  content: string;
  status: KnowledgeStatus;
  metadata: Record<string, unknown>;
  /** Model that produced this source's vectors; null until indexed. */
  embeddingModel: string | null;
  chunkCount: number;
  /** Plain-language failure reason when status is error. */
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeChunk {
  id: string;
  sourceId: string;
  agentId: string;
  index: number;
  text: string;
  charCount: number;
  tokenCount: number;
  embeddingModel: string | null;
  createdAt: string;
}

export interface AddKnowledgeChunkInput {
  sourceId: string;
  agentId: string;
  index: number;
  text: string;
  charCount: number;
  tokenCount: number;
  embedding: number[];
  embeddingModel: string;
}

export interface KnowledgeSearchHit {
  sourceId: string;
  sourceName: string;
  chunkId: string;
  index: number;
  text: string;
  score: number;
}

export interface UserProfile {
  id: string;
  userId: string;
  displayName: string | null;
  phone: string | null;
  email: string | null;
  timezone: string | null;
  locale: string | null;
  notes: string | null;
  tags: string[];
  customFields: Record<string, unknown>;
  preferences: Record<string, unknown>;
  importantDetails: Record<string, unknown>;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ConversationStatus = 'open' | 'closing' | 'closed';

export interface Conversation {
  id: string;
  agentId: string;
  userId: string | null;
  channel: string;
  status: ConversationStatus;
  reviewEnabled: boolean;
  reviewRequestedAt: string | null;
  reviewRating: number | null;
  reviewText: string | null;
  metadata: Record<string, unknown>;
  startedAt: string;
  endedAt: string | null;
}

export interface AnalyticsEvent {
  id: string;
  type: string;
  agentId: string | null;
  conversationId: string | null;
  userId: string | null;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface CreateAgentInput {
  name: string;
  prompt?: string;
  model?: string | null;
  fallbackModel?: string | null;
  voice?: string | null;
  settings?: Record<string, unknown>;
}

export interface UpdateAgentInput {
  name?: string;
  status?: AgentStatus;
  prompt?: string;
  model?: string | null;
  fallbackModel?: string | null;
  voice?: string | null;
  settings?: Record<string, unknown>;
}

export type ModelProviderType = 'openai-compatible' | 'anthropic' | 'google' | 'fish' | 'elevenlabs';

export type ModelRole = 'chat' | 'voice' | 'call' | 'vision';

export interface ModelRoleConfig {
  provider: ModelProviderType;
  baseUrl: string;
  /** The key is never returned to the browser; this says whether one is stored. */
  hasApiKey: boolean;
  model: string;
  fallbackProvider: ModelProviderType;
  fallbackBaseUrl: string;
  hasFallbackApiKey: boolean;
  fallbackModel: string;
}

export interface ModelSettings extends ModelRoleConfig {
  id: string;
  provider: ModelProviderType;
  baseUrl: string;
  /** The key is never returned to the browser; this says whether one is stored. */
  hasApiKey: boolean;
  model: string;
  fallbackProvider: ModelProviderType;
  fallbackBaseUrl: string;
  hasFallbackApiKey: boolean;
  fallbackModel: string;
  updatedAt: string;
}

export interface ModelSettingsSecrets extends ModelSettings {
  apiKey: string | null;
  fallbackApiKey: string | null;
}

export interface ModelRoleSettings extends ModelRoleConfig {
  role: ModelRole;
  updatedAt: string;
}

export interface ModelRoleSettingsSecrets extends ModelRoleSettings {
  apiKey: string | null;
  fallbackApiKey: string | null;
}

/** The subset the attachment reader needs to call a vision model. */
export interface VisionSettings {
  provider: ModelProviderType;
  baseUrl: string;
  apiKey: string | null;
  model: string;
  fallbackProvider: ModelProviderType;
  fallbackBaseUrl: string;
  fallbackApiKey: string | null;
  fallbackModel: string;
}

export interface UpdateModelRoleSettingsInput {
  provider?: ModelProviderType;
  baseUrl?: string;
  apiKey?: string | null;
  model?: string;
  fallbackProvider?: ModelProviderType;
  fallbackBaseUrl?: string;
  fallbackApiKey?: string | null;
  fallbackModel?: string;
}

export interface UpdateModelSettingsInput {
  provider?: ModelProviderType;
  baseUrl?: string;
  /** Omit to keep the stored key; null clears it. */
  apiKey?: string | null;
  model?: string;
  fallbackProvider?: ModelProviderType;
  fallbackBaseUrl?: string;
  fallbackApiKey?: string | null;
  fallbackModel?: string;
}

export interface ModelProbeResult {
  served: 'primary' | 'fallback';
  model: string;
  ok: boolean;
  ms: number;
  detail: string;
}

export interface CreateSkillInput {
  name: string;
  description?: string;
  instructions: string;
  enabled?: boolean;
}

export interface CreateKnowledgeInput {
  name: string;
  kind: KnowledgeKind;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface UpsertUserProfileInput {
  userId: string;
  displayName?: string | null;
  phone?: string | null;
  email?: string | null;
  timezone?: string | null;
  locale?: string | null;
  notes?: string | null;
  tags?: string[];
  customFields?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
  importantDetails?: Record<string, unknown>;
  lastSeenAt?: string | null;
}

/* ---------------------------------------------------------------------- */
/* User profile facts, summaries, and segments                            */
/* ---------------------------------------------------------------------- */

export type ProfileFactKind = 'identity' | 'preference' | 'constraint' | 'goal' | 'relationship' | 'communication' | 'other';
export type ProfileFactSensitivity = 'normal' | 'personal' | 'sensitive';
export type ProfileFactStatus = 'active' | 'superseded' | 'deleted';

export interface UserProfileFact {
  id: string;
  userId: string;
  kind: ProfileFactKind;
  key: string;
  value: unknown;
  confidence: number;
  source: string;
  sourceRef: string | null;
  evidence: string | null;
  firstSeenAt: string;
  lastConfirmedAt: string;
  expiresAt: string | null;
  sensitivity: ProfileFactSensitivity;
  status: ProfileFactStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserProfileFactInput {
  userId: string;
  kind: ProfileFactKind;
  key: string;
  value: unknown;
  confidence?: number;
  source?: string;
  sourceRef?: string | null;
  evidence?: string | null;
  expiresAt?: string | null;
  sensitivity?: ProfileFactSensitivity;
}

export interface UpdateUserProfileFactInput {
  kind?: ProfileFactKind;
  key?: string;
  value?: unknown;
  confidence?: number;
  source?: string;
  sourceRef?: string | null;
  evidence?: string | null;
  expiresAt?: string | null;
  sensitivity?: ProfileFactSensitivity;
  status?: ProfileFactStatus;
}

export interface UserProfileSummary {
  userId: string;
  summary: string;
  version: number;
  tokenCount: number;
  model: string;
  sourceFactIds: string[];
  generatedAt: string;
}

export interface UpsertUserProfileSummaryInput {
  userId: string;
  summary: string;
  tokenCount?: number;
  model?: string;
  sourceFactIds?: string[];
}

export interface UserSegment {
  id: string;
  userId: string;
  segmentType: string;
  segmentValue: string;
  score: number | null;
  reason: string;
  computedAt: string;
  expiresAt: string | null;
}

export interface UpsertUserSegmentInput {
  userId: string;
  segmentType: string;
  segmentValue: string;
  score?: number | null;
  reason?: string;
  expiresAt?: string | null;
}

export interface ProfileContext {
  userId: string;
  text: string;
  profile: UserProfile;
  facts: UserProfileFact[];
  segments: UserSegment[];
  summary: UserProfileSummary | null;
}

export interface CreateConversationInput {
  agentId: string;
  userId?: string | null;
  channel?: string;
  reviewEnabled?: boolean;
  metadata?: Record<string, unknown>;
}

export type ConversationMessageRole = 'customer' | 'agent' | 'system' | 'tool';

/** One persisted turn in an agent conversation. */
export interface ConversationMessage {
  id: string;
  conversationId: string;
  agentId: string;
  userId: string | null;
  role: ConversationMessageRole;
  channel: string;
  text: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CreateConversationMessageInput {
  conversationId: string;
  agentId: string;
  userId?: string | null;
  role: ConversationMessageRole;
  channel?: string;
  text: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

/** Conversation plus the fields the chat-history table needs in one row. */
export interface ConversationSummary extends Conversation {
  messageCount: number;
  lastMessage: string | null;
  lastMessageRole: ConversationMessageRole | null;
  lastMessageAt: string | null;
  contactName: string | null;
  contactPhone: string | null;
}

export interface ConversationListFilter {
  agentId?: string;
  channel?: string;
  status?: string;
  from?: string;
  to?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface ConversationPage {
  conversations: ConversationSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RecordEventInput {
  type: string;
  agentId?: string | null;
  conversationId?: string | null;
  userId?: string | null;
  data?: Record<string, unknown>;
}

/* ---------------------------------------------------------------------- */
/* External MCP servers                                                   */
/* ---------------------------------------------------------------------- */

export interface ExternalMcpServer {
  id: string;
  name: string;
  description: string;
  url: string;
  headers: Record<string, string>;
  enabled: boolean;
  lastRefreshedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExternalMcpServerInput {
  name: string;
  description?: string;
  url: string;
  headers?: Record<string, string>;
  enabled?: boolean;
}

export interface UpdateExternalMcpServerInput {
  name?: string;
  description?: string | null;
  url?: string;
  headers?: Record<string, string> | null;
  enabled?: boolean;
}

export interface ExternalMcpToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
}

export interface ExternalMcpTool {
  id: string;
  serverId: string;
  serverName: string;
  /** Name on the remote MCP server. */
  name: string;
  /** Stable, namespaced name BunWa advertises to agents. */
  qualifiedName: string;
  description: string;
  /** Raw JSON Schema from the remote server. Kept verbatim for the agent UI. */
  inputSchema: unknown;
  annotations: ExternalMcpToolAnnotations | null;
  tier: 'read' | 'write';
  destructive: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertExternalMcpToolInput {
  name: string;
  description: string;
  inputSchema: unknown;
  annotations: ExternalMcpToolAnnotations | null;
  tier: 'read' | 'write';
  destructive: boolean;
}
