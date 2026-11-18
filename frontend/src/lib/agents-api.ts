import { getApiAuthHeaders } from "./api"

export type AgentStatus = "draft" | "active" | "paused"

export interface Agent {
  id: string
  name: string
  status: AgentStatus
  prompt: string
  model: string | null
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
  status: "pending" | "ready" | "error"
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
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

export const agentApi = {
  list: () => request<{ agents: Agent[] }>("/api/agents").then((r) => r.agents),

  get: (id: string) => request<{ agent: Agent }>(`/api/agents/${id}`).then((r) => r.agent),

  create: (input: {
    name: string
    prompt?: string
    model?: string | null
    voice?: string | null
    settings?: Record<string, unknown>
    skills?: Array<{ name: string; description?: string; instructions: string; enabled?: boolean }>
    knowledge?: Array<{ name: string; kind: "text" | "url" | "file"; content: string; metadata?: Record<string, unknown> }>
  }) =>
    request<{ agent: Agent }>("/api/agents", {
      method: "POST",
      body: JSON.stringify(input),
    }).then((r) => r.agent),

  update: (id: string, input: Partial<Pick<Agent, "name" | "status" | "prompt" | "model" | "voice" | "settings">>) =>
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

  removeKnowledge: (agentId: string, sourceId: string) =>
    request<{ ok: boolean }>(`/api/agents/${agentId}/knowledge/${sourceId}`, { method: "DELETE" }),

  analytics: (agentId?: string) =>
    request<AgentAnalytics>(`/api/agents/analytics${agentId ? `?agentId=${encodeURIComponent(agentId)}` : ""}`),

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
}
