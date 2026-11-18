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
export type KnowledgeStatus = 'pending' | 'ready' | 'error';

export interface KnowledgeSource {
  id: string;
  agentId: string;
  name: string;
  kind: KnowledgeKind;
  content: string;
  status: KnowledgeStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
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

export type ModelRole = 'chat' | 'voice' | 'call';

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

export interface CreateConversationInput {
  agentId: string;
  userId?: string | null;
  channel?: string;
  reviewEnabled?: boolean;
  metadata?: Record<string, unknown>;
}

export interface RecordEventInput {
  type: string;
  agentId?: string | null;
  conversationId?: string | null;
  userId?: string | null;
  data?: Record<string, unknown>;
}
