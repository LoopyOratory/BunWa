import { getApiAuthHeaders } from "./api"

export type AgentStatus = "draft" | "active" | "paused"

export interface Agent {
  id: string
  name: string
  status: AgentStatus
  prompt: string
  model: string | null
  fallbackModel: string | null
  voice: string | null
  settings: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface AgentSkill {
  id: string
  agentId: string
  name: string
  description: string
  instructions: string
  enabled: boolean
  createdAt: string
}

export interface KnowledgeSource {
  id: string
  agentId: string
  name: string
  kind: "text" | "url" | "file"
  content: string
  status: "pending" | "processing" | "ready" | "error"
  metadata: Record<string, unknown>
  embeddingModel: string | null
  chunkCount: number
  error: string | null
  createdAt: string
  updatedAt: string
}

export interface KnowledgeChunk {
  id: string
  sourceId: string
  agentId: string
  index: number
  text: string
  charCount: number
  tokenCount: number
  embeddingModel: string | null
  createdAt: string
}

export interface AttachmentResult {
  kind: "document" | "image"
  filename: string
  mimetype: string
  sizeBytes: number
  text: string
  truncated: boolean
  image?: {
    width: number | null
    height: number | null
    format: string | null
    model: string
  }
  metadata: Record<string, unknown>
}

export interface BuilderQuestion {
  id: string
  question: string
  hint?: string
  required?: boolean
}

export interface AgentAnalytics {
  agents: number
  conversations: number
  closedConversations: number
  reviews: number
  averageRating: number | null
  conversions: number
  conversionRate: number | null
  events: Array<{ type: string; count: number }>
}

export type AnalyticsRangeKey = "24h" | "7d" | "30d" | "90d"
export type AnalyticsChannel = "all" | "whatsapp" | "voice"
export type AnalyticsUnit = "count" | "percent" | "ms" | "currency" | "rating"

export interface AnalyticsKpi {
  value: number | null
  previous: number | null
  delta: number | null
  deltaPct: number | null
  sample: number
  unit: AnalyticsUnit
}

export interface AnalyticsSeriesPoint {
  bucket: string
  label: string
  started: number
  engaged: number
  resolved: number
  converted: number
  handoffs: number
  reviews: number
  avgRating: number | null
  medianResponseMs: number | null
  costCents: number
}

export interface AnalyticsFunnel {
  started: number
  engaged: number
  qualified: number
  resolved: number
  converted: number
}

export interface AnalyticsLeaderboardRow {
  agentId: string
  agentName: string
  status: AgentStatus
  conversations: number
  resolved: number
  resolutionRate: number | null
  conversionRate: number | null
  csat: number | null
  reviews: number
  medianResponseMs: number | null
  costCents: number
  costPerConversationCents: number | null
  sparkline: number[]
}

export interface AnalyticsAttentionItem {
  id: string
  severity: "critical" | "warning" | "info"
  title: string
  detail: string
  agentId?: string
  agentName?: string
}

export interface AnalyticsTopicRow {
  topic: string
  conversations: number
  resolved: number
  conversionRate: number | null
  share: number
}

export interface AnalyticsToolRow {
  name: string
  calls: number
  successes: number
  failures: number
  successRate: number | null
  p95Ms: number | null
}

export interface AnalyticsKnowledgeGap {
  query: string
  count: number
  agentId: string | null
  agentName: string | null
  lastSeenAt: string
}

export type ConversationOutcome = "resolved" | "converted" | "handoff" | "abandoned" | "open" | "unclassified"

export interface AnalyticsRecentConversation {
  id: string
  agentId: string
  agentName: string
  channel: string
  status: "open" | "closing" | "closed"
  outcome: ConversationOutcome
  topic: string | null
  rating: number | null
  messages: number
  durationMs: number | null
  startedAt: string
}

export interface AgentAnalyticsDashboard {
  range: AnalyticsRangeKey
  from: string
  to: string
  previousFrom: string
  previousTo: string
  agentId: string | null
  channel: AnalyticsChannel
  currency: string
  totals: {
    conversations: number
    engaged: number
    resolved: number
    converted: number
    handoffs: number
    reviews: number
    averageRating: number | null
    reviewResponseRate: number | null
    totalCostCents: number
    currency: string
  }
  kpis: {
    conversations: AnalyticsKpi
    resolution: AnalyticsKpi
    csat: AnalyticsKpi
    firstResponse: AnalyticsKpi
    handoffs: AnalyticsKpi
    cost: AnalyticsKpi
  }
  series: AnalyticsSeriesPoint[]
  csatDistribution: number[]
  funnel: AnalyticsFunnel
  leaderboard: AnalyticsLeaderboardRow[]
  attention: AnalyticsAttentionItem[]
  topics: AnalyticsTopicRow[]
  tools: AnalyticsToolRow[]
  knowledgeGaps: AnalyticsKnowledgeGap[]
  recentConversations: AnalyticsRecentConversation[]
  generatedAt: string
}

export type ModelProviderType = "openai-compatible" | "anthropic" | "google" | "fish" | "elevenlabs"

export type ModelRole = "chat" | "voice" | "call" | "vision"

export interface ModelRoleConfig {
  provider: ModelProviderType
  baseUrl: string
  hasApiKey: boolean
  model: string
  fallbackProvider: ModelProviderType
  fallbackBaseUrl: string
  hasFallbackApiKey: boolean
  fallbackModel: string
}

export interface ModelRoleSettings extends ModelRoleConfig {
  role: ModelRole
  updatedAt: string
}

export interface McpToolInfo {
  name: string
  description: string
  tier: "read" | "write"
  category?: string
  destructive?: boolean
  sessionScoped?: boolean
  serverId?: string
  serverName?: string
  remoteName?: string
}

export interface ExternalMcpToolInfo {
  id: string
  serverId: string
  serverName: string
  name: string
  qualifiedName: string
  description: string
  inputSchema: unknown
  annotations: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean } | null
  tier: "read" | "write"
  destructive: boolean
  enabled: boolean
}

export interface ExternalMcpServerInfo {
  id: string
  name: string
  description: string
  url: string
  headerNames: string[]
  enabled: boolean
  lastRefreshedAt: string | null
  lastError: string | null
  toolCount: number
  tools: ExternalMcpToolInfo[]
  createdAt: string
  updatedAt: string
}

export interface AgentMcpConfig {
  enabled: boolean
  allowedTools: string[]
  deniedTools: string[]
  destructiveOps: boolean
  /** WhatsApp session bound to this agent's session-scoped tools. */
  session?: string | null
  hasApiKey?: boolean
  canRevealKey?: boolean
  apiKeyPrefix?: string | null
  apiKeyCreatedAt?: string | null
  apiKeyLastUsedAt?: string | null
}

export interface ModelSettings {
  id: string
  provider: ModelProviderType
  baseUrl: string
  hasApiKey: boolean
  model: string
  fallbackProvider: ModelProviderType
  fallbackBaseUrl: string
  hasFallbackApiKey: boolean
  fallbackModel: string
  updatedAt: string
}

export interface ModelProbeResult {
  served: 'primary' | 'fallback'
  model: string
  ok: boolean
  ms: number
  detail: string
}

export interface AgentEvent {
  id: string
  type: string
  agentId: string | null
  conversationId: string | null
  userId: string | null
  data: Record<string, unknown>
  createdAt: string
}

export interface Conversation {
  id: string
  agentId: string
  userId: string | null
  channel: string
  status: "open" | "closing" | "closed"
  reviewEnabled: boolean
  reviewRequestedAt: string | null
  reviewRating: number | null
  reviewText: string | null
  metadata: Record<string, unknown>
  startedAt: string
  endedAt: string | null
}

export type ConversationMessageRole = "customer" | "agent" | "system" | "tool"

export interface ConversationMessage {
  id: string
  conversationId: string
  agentId: string
  userId: string | null
  role: ConversationMessageRole
  channel: string
  text: string
  metadata: Record<string, unknown>
  createdAt: string
}

export interface ConversationSummary extends Conversation {
  messageCount: number
  lastMessage: string | null
  lastMessageRole: ConversationMessageRole | null
  lastMessageAt: string | null
  contactName: string | null
  contactPhone: string | null
}

export interface ConversationPage {
  conversations: ConversationSummary[]
  total: number
  page: number
  pageSize: number
}

export interface UserProfile {
  id: string
  userId: string
  displayName: string | null
  phone: string | null
  email: string | null
  timezone: string | null
  locale: string | null
  notes: string | null
  tags: string[]
  customFields: Record<string, unknown>
  preferences: Record<string, unknown>
  importantDetails: Record<string, unknown>
  lastSeenAt: string | null
  createdAt: string
  updatedAt: string
}

export type ProfileFactKind = "identity" | "preference" | "constraint" | "goal" | "relationship" | "communication" | "other"
export type ProfileFactSensitivity = "normal" | "personal" | "sensitive"
export type ProfileFactStatus = "active" | "superseded" | "deleted"

export interface UserProfileFact {
  id: string
  userId: string
  kind: ProfileFactKind
  key: string
  value: unknown
  confidence: number
  source: string
  sourceRef: string | null
  evidence: string | null
  firstSeenAt: string
  lastConfirmedAt: string
  expiresAt: string | null
  sensitivity: ProfileFactSensitivity
  status: ProfileFactStatus
  createdAt: string
  updatedAt: string
}

export interface UserProfileSummary {
  userId: string
  summary: string
  version: number
  tokenCount: number
  model: string
  sourceFactIds: string[]
  generatedAt: string
}

export interface UserSegment {
  id: string
  userId: string
  segmentType: string
  segmentValue: string
  score: number | null
  reason: string
  computedAt: string
  expiresAt: string | null
}

export interface ProfileContext {
  userId: string
  text: string
  profile: UserProfile
  facts: UserProfileFact[]
  segments: UserSegment[]
  summary: UserProfileSummary | null
}

const API_BASE = window.location.origin

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...getApiAuthHeaders(),
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(body.error || body.message || `HTTP ${res.status}`)
  }
  return res.json()
}

async function requestForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: getApiAuthHeaders(),
    body: form,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(body.error || body.message || `HTTP ${res.status}`)
  }
  return res.json()
}

export const agentApi = {
  list: () => request<{ agents: Agent[] }>("/api/agents").then((r) => r.agents),

  get: (id: string) => request<{ agent: Agent }>(`/api/agents/${id}`).then((r) => r.agent),

  create: (input: {
    name: string
    prompt?: string
    model?: string | null
    fallbackModel?: string | null
    voice?: string | null
    settings?: Record<string, unknown>
    skills?: Array<{ name: string; description?: string; instructions: string; enabled?: boolean }>
    knowledge?: Array<{ name: string; kind: "text" | "url" | "file"; content: string; metadata?: Record<string, unknown> }>
  }) =>
    request<{ agent: Agent }>("/api/agents", {
      method: "POST",
      body: JSON.stringify(input),
    }).then((r) => r.agent),

  update: (id: string, input: Partial<Pick<Agent, "name" | "status" | "prompt" | "model" | "fallbackModel" | "voice" | "settings">>) =>
    request<{ agent: Agent }>(`/api/agents/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }).then((r) => r.agent),

  remove: (id: string) => request<{ ok: boolean }>(`/api/agents/${id}`, { method: "DELETE" }),

  effectivePrompt: (id: string) =>
    request<{ prompt: string }>(`/api/agents/${id}/effective-prompt`).then((r) => r.prompt),

  builderQuestions: () => request<{ questions: BuilderQuestion[] }>("/api/agents/builder/questions").then((r) => r.questions),

  builderNext: (answers: Record<string, string>) =>
    request<{ next: BuilderQuestion | null; prompt: string }>("/api/agents/builder/next", {
      method: "POST",
      body: JSON.stringify({ answers }),
    }),

  builderPrompt: (answers: Record<string, string>) =>
    request<{ prompt: string }>("/api/agents/builder/prompt", {
      method: "POST",
      body: JSON.stringify({ answers }),
    }).then((r) => r.prompt),

  listSkills: (agentId: string) =>
    request<{ skills: AgentSkill[] }>(`/api/agents/${agentId}/skills`).then((r) => r.skills),

  addSkill: (agentId: string, input: { name: string; description?: string; instructions: string; enabled?: boolean }) =>
    request<{ skill: AgentSkill }>(`/api/agents/${agentId}/skills`, {
      method: "POST",
      body: JSON.stringify(input),
    }).then((r) => r.skill),

  removeSkill: (agentId: string, skillId: string) =>
    request<{ ok: boolean }>(`/api/agents/${agentId}/skills/${skillId}`, { method: "DELETE" }),

  listKnowledge: (agentId: string) =>
    request<{ knowledge: KnowledgeSource[] }>(`/api/agents/${agentId}/knowledge`).then((r) => r.knowledge),

  addKnowledge: (agentId: string, input: { name: string; kind: "text" | "url" | "file"; content: string; metadata?: Record<string, unknown> }) =>
    request<{ source: KnowledgeSource }>(`/api/agents/${agentId}/knowledge`, {
      method: "POST",
      body: JSON.stringify(input),
    }).then((r) => r.source),

  uploadKnowledge: (agentId: string, file: File, name?: string) => {
    const form = new FormData()
    form.append("file", file)
    if (name?.trim()) form.append("name", name.trim())
    return requestForm<{ source: KnowledgeSource }>(`/api/agents/${agentId}/knowledge/upload`, form).then((r) => r.source)
  },

  readAttachment: (agentId: string, file: File, caption?: string) => {
    const form = new FormData()
    form.append("file", file)
    if (caption?.trim()) form.append("caption", caption.trim())
    return requestForm<{ attachment: AttachmentResult }>(`/api/agents/${agentId}/attachments`, form).then(
      (r) => r.attachment,
    )
  },

  listKnowledgeChunks: (agentId: string, sourceId: string) =>
    request<{ chunks: KnowledgeChunk[] }>(`/api/agents/${agentId}/knowledge/${sourceId}/chunks`).then((r) => r.chunks),

  searchKnowledge: (agentId: string, query: string, limit = 4) =>
    request<{ hits: Array<{ sourceId: string; sourceName: string; chunkId: string; index: number; text: string; score: number }> }>(
      `/api/agents/${agentId}/knowledge/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    ).then((r) => r.hits),

  removeKnowledge: (agentId: string, sourceId: string) =>
    request<{ ok: boolean }>(`/api/agents/${agentId}/knowledge/${sourceId}`, { method: "DELETE" }),

  analytics: (agentId?: string) =>
    request<AgentAnalytics>(`/api/agents/analytics${agentId ? `?agentId=${encodeURIComponent(agentId)}` : ""}`),

  analyticsDashboard: (input: {
    range: AnalyticsRangeKey
    channel?: AnalyticsChannel
    agentId?: string | null
    from?: string | null
    to?: string | null
  }) => {
    const params = new URLSearchParams({ range: input.range })
    if (input.channel && input.channel !== "all") params.set("channel", input.channel)
    if (input.agentId) params.set("agentId", input.agentId)
    if (input.from) params.set("from", input.from)
    if (input.to) params.set("to", input.to)
    return request<AgentAnalyticsDashboard>(`/api/agents/analytics/dashboard?${params.toString()}`)
  },

  modelSettings: () =>
    request<{ settings: ModelSettings }>("/api/agents/models/settings").then((r) => r.settings),

  updateModelSettings: (input: {
    provider?: ModelProviderType
    baseUrl?: string
    apiKey?: string | null
    model?: string
    fallbackProvider?: ModelProviderType
    fallbackBaseUrl?: string
    fallbackApiKey?: string | null
    fallbackModel?: string
  }) =>
    request<{ settings: ModelSettings }>("/api/agents/models/settings", {
      method: "PUT",
      body: JSON.stringify(input),
    }).then((r) => r.settings),

  testModelSettings: () =>
    request<{ results: ModelProbeResult[] }>("/api/agents/models/settings/test", { method: "POST" }).then((r) => r.results),

  modelRoles: () =>
    request<{ roles: ModelRoleSettings[] }>("/api/agents/models/roles").then((r) => r.roles),

  modelRole: (role: ModelRole) =>
    request<{ settings: ModelRoleSettings }>(`/api/agents/models/roles/${role}`).then((r) => r.settings),

  updateModelRole: (role: ModelRole, input: Partial<ModelRoleConfig> & { apiKey?: string | null; fallbackApiKey?: string | null }) =>
    request<{ settings: ModelRoleSettings }>(`/api/agents/models/roles/${role}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }).then((r) => r.settings),

  mcpTools: () =>
    request<{ tools: McpToolInfo[]; byCategory: Record<string, McpToolInfo[]> }>("/api/mcp/tools"),

  agentMcp: (id: string) =>
    request<{ mcp: AgentMcpConfig }>(`/api/agents/${id}/mcp`).then((r) => r.mcp),

  updateAgentMcp: (id: string, input: Partial<AgentMcpConfig>) =>
    request<{ mcp: AgentMcpConfig }>(`/api/agents/${id}/mcp`, {
      method: "PUT",
      body: JSON.stringify(input),
    }).then((r) => r.mcp),

  generateAgentMcpKey: (id: string) =>
    request<{ key: string; prefix: string; createdAt: string }>(`/api/agents/${id}/mcp/key`, {
      method: "POST",
    }),

  revealAgentMcpKey: (id: string) =>
    request<{ key: string; prefix: string | null }>(`/api/agents/${id}/mcp/key`),

  deleteAgentMcpKey: (id: string) =>
    request<{ result: boolean }>(`/api/agents/${id}/mcp/key`, { method: "DELETE" }).then((r) => r.result),

  externalMcpServers: () =>
    request<{ servers: ExternalMcpServerInfo[] }>("/api/mcp/external/servers").then((r) => r.servers),

  createExternalMcpServer: (input: {
    name: string
    description?: string
    url: string
    headers?: Record<string, string>
    enabled?: boolean
  }) =>
    request<{ server: ExternalMcpServerInfo }>("/api/mcp/external/servers", {
      method: "POST",
      body: JSON.stringify(input),
    }).then((r) => r.server),

  updateExternalMcpServer: (
    id: string,
    input: {
      name?: string
      description?: string
      url?: string
      headers?: Record<string, string>
      enabled?: boolean
    },
  ) =>
    request<{ server: ExternalMcpServerInfo }>(`/api/mcp/external/servers/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }).then((r) => r.server),

  deleteExternalMcpServer: (id: string) =>
    request<{ result: boolean }>(`/api/mcp/external/servers/${id}`, { method: "DELETE" }).then((r) => r.result),

  refreshExternalMcpServer: (id: string) =>
    request<{ tools: ExternalMcpToolInfo[]; server?: ExternalMcpServerInfo }>(`/api/mcp/external/servers/${id}/refresh`, { method: "POST" }).then((r) => r.tools),

  revealExternalMcpServerHeaders: (id: string) =>
    request<{ headers: Record<string, string> }>(`/api/mcp/external/servers/${id}/headers`).then((r) => r.headers),

  events: (filter: { agentId?: string; conversationId?: string; type?: string; limit?: number } = {}) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(filter)) {
      if (value !== undefined) params.set(key, String(value))
    }
    return request<{ events: AgentEvent[] }>(`/api/agents/events?${params.toString()}`).then((r) => r.events)
  },

  recordEvent: (input: { type: string; agentId?: string; conversationId?: string; userId?: string; data?: Record<string, unknown> }) =>
    request<{ event: AgentEvent }>("/api/agents/events", {
      method: "POST",
      body: JSON.stringify(input),
    }).then((r) => r.event),

  createConversation: (agentId: string, input: { userId?: string; channel?: string; reviewEnabled?: boolean; metadata?: Record<string, unknown> }) =>
    request<{ conversation: Conversation }>(`/api/agents/${agentId}/conversations`, {
      method: "POST",
      body: JSON.stringify(input),
    }).then((r) => r.conversation),

  conversations: (input: {
    agentId?: string | null
    channel?: AnalyticsChannel
    range?: AnalyticsRangeKey
    status?: "open" | "closing" | "closed" | null
    from?: string | null
    to?: string | null
    q?: string
    page?: number
    pageSize?: number
  } = {}) => {
    const params = new URLSearchParams()
    if (input.agentId) params.set("agentId", input.agentId)
    if (input.channel && input.channel !== "all") params.set("channel", input.channel)
    if (input.range) params.set("range", input.range)
    if (input.status) params.set("status", input.status)
    if (input.from) params.set("from", input.from)
    if (input.to) params.set("to", input.to)
    if (input.q?.trim()) params.set("q", input.q.trim())
    params.set("page", String(input.page ?? 1))
    params.set("pageSize", String(input.pageSize ?? 20))
    return request<ConversationPage>(`/api/agents/conversations?${params.toString()}`)
  },

  conversationMessages: (id: string, input: { limit?: number; before?: string; after?: string } = {}) => {
    const params = new URLSearchParams()
    if (input.limit) params.set("limit", String(input.limit))
    if (input.before) params.set("before", input.before)
    if (input.after) params.set("after", input.after)
    return request<{ conversation: Conversation; messages: ConversationMessage[] }>(
      `/api/agents/conversations/${id}/messages?${params.toString()}`,
    )
  },

  addConversationMessage: (id: string, input: { role: ConversationMessageRole; text: string; userId?: string; metadata?: Record<string, unknown> }) =>
    request<{ message: ConversationMessage }>(`/api/agents/conversations/${id}/messages`, {
      method: "POST",
      body: JSON.stringify(input),
    }).then((r) => r.message),

  getConversation: (id: string) =>
    request<{ conversation: Conversation }>(`/api/agents/conversations/${id}`).then((r) => r.conversation),

  closeConversation: (id: string) =>
    request<{ conversation: Conversation }>(`/api/agents/conversations/${id}/close`, { method: "POST" }).then((r) => r.conversation),

  scheduleClose: (id: string, input: { session: string; chatId: string; closesInSeconds?: number; reviewLeadSeconds?: number; message?: string }) =>
    request<{ scheduled: boolean; reviewAt: string | null; closeAt: string }>(`/api/agents/conversations/${id}/schedule-close`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  requestReview: (id: string) =>
    request<{ conversation: Conversation }>(`/api/agents/conversations/${id}/review-request`, { method: "POST" }).then((r) => r.conversation),

  submitReview: (id: string, rating: number, text?: string) =>
    request<{ conversation: Conversation }>(`/api/agents/conversations/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ rating, text }),
    }).then((r) => r.conversation),

  getProfile: (userId: string) =>
    request<{ profile: UserProfile }>(`/api/agents/profiles/${encodeURIComponent(userId)}`).then((r) => r.profile),

  upsertProfile: (userId: string, input: Partial<UserProfile>) =>
    request<{ profile: UserProfile }>(`/api/agents/profiles/${encodeURIComponent(userId)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }).then((r) => r.profile),

  profiles: (limit = 100) =>
    request<{ profiles: UserProfile[] }>(`/api/agents/profiles?limit=${limit}`).then((r) => r.profiles),

  profileFacts: (userId: string, includeInactive = false) =>
    request<{ facts: UserProfileFact[] }>(
      `/api/agents/profiles/${encodeURIComponent(userId)}/facts${includeInactive ? "?includeInactive=1" : ""}`,
    ).then((r) => r.facts),

  createProfileFact: (userId: string, input: {
    kind: ProfileFactKind
    key: string
    value: unknown
    confidence?: number
    source?: string
    sourceRef?: string | null
    evidence?: string | null
    expiresAt?: string | null
    sensitivity?: ProfileFactSensitivity
  }) =>
    request<{ fact: UserProfileFact }>(`/api/agents/profiles/${encodeURIComponent(userId)}/facts`, {
      method: "POST",
      body: JSON.stringify(input),
    }).then((r) => r.fact),

  updateProfileFact: (userId: string, factId: string, input: Partial<UserProfileFact>) =>
    request<{ fact: UserProfileFact }>(
      `/api/agents/profiles/${encodeURIComponent(userId)}/facts/${encodeURIComponent(factId)}`,
      { method: "PUT", body: JSON.stringify(input) },
    ).then((r) => r.fact),

  deleteProfileFact: (userId: string, factId: string) =>
    request<{ ok: boolean }>(
      `/api/agents/profiles/${encodeURIComponent(userId)}/facts/${encodeURIComponent(factId)}`,
      { method: "DELETE" },
    ).then((r) => r.ok),

  profileContext: (userId: string, includeSensitive = false) =>
    request<{ context: ProfileContext }>(
      `/api/agents/profiles/${encodeURIComponent(userId)}/context${includeSensitive ? "?includeSensitive=1" : ""}`,
    ).then((r) => r.context),

  extractProfileFacts: (userId: string, messages: Array<{ role: string; content: string }>) =>
    request<{ facts: UserProfileFact[] }>(`/api/agents/profiles/${encodeURIComponent(userId)}/extract`, {
      method: "POST",
      body: JSON.stringify({ messages }),
    }).then((r) => r.facts),

  profileSummary: (userId: string) =>
    request<{ summary: UserProfileSummary | null }>(`/api/agents/profiles/${encodeURIComponent(userId)}/summary`).then(
      (r) => r.summary,
    ),

  upsertProfileSummary: (userId: string, summary: string) =>
    request<{ summary: UserProfileSummary }>(`/api/agents/profiles/${encodeURIComponent(userId)}/summary`, {
      method: "PUT",
      body: JSON.stringify({ summary }),
    }).then((r) => r.summary),

  summarizeProfile: (userId: string) =>
    request<{ summary: UserProfileSummary }>(`/api/agents/profiles/${encodeURIComponent(userId)}/summarize`, {
      method: "POST",
    }).then((r) => r.summary),

  profileSegments: (userId: string) =>
    request<{ segments: UserSegment[] }>(`/api/agents/profiles/${encodeURIComponent(userId)}/segments`).then(
      (r) => r.segments,
    ),

  createProfileSegment: (userId: string, input: {
    segmentType: string
    segmentValue: string
    score?: number | null
    reason?: string
    expiresAt?: string | null
  }) =>
    request<{ segment: UserSegment }>(`/api/agents/profiles/${encodeURIComponent(userId)}/segments`, {
      method: "POST",
      body: JSON.stringify(input),
    }).then((r) => r.segment),

  deleteProfileSegment: (userId: string, segmentId: string) =>
    request<{ ok: boolean }>(
      `/api/agents/profiles/${encodeURIComponent(userId)}/segments/${encodeURIComponent(segmentId)}`,
      { method: "DELETE" },
    ).then((r) => r.ok),
}
