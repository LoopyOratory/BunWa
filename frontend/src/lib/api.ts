export interface Session {
  name: string
  status: "STOPPED" | "STARTING" | "WORKING" | "SCAN_QR_CODE" | "FAILED"
  config: Record<string, any>
  me?: { id: string; pushName?: string }
  presence?: any
  timestamps?: { activity: number }
}

export interface Worker {
  name: string
  apiUrl: string
  engine: string
  version: string
  tier: string
  uptime: string
  sessions: number
  connected: boolean
}

export interface ServerVersion {
  version: string
  engine: string
  tier: string
}

export interface AuditEntry {
  id: string
  action: string
  severity: "info" | "warn" | "error" | string
  sessionName?: string
  apiKeyName?: string
  ipAddress?: string
  statusCode?: number
  errorMessage?: string
  createdAt: string
}

export interface QRCodeResponse {
  qr?: { raw: string }
}

export interface ScreenshotResponse {
  screenshot?: string
}

export interface ChatOverview {
  id: string
  name: string
  picture?: string
  unreadCount?: number
  lastMessage?: {
    id: string
    timestamp: number
    from: string
    fromMe: boolean
    body: string
  }
}

export interface Message {
  id: string
  timestamp: number
  from: string
  fromMe: boolean
  to: string
  body: string
  hasMedia: boolean
  ack: number
  ackName: string
  replyTo?: string | null
  reactions?: { key?: { id?: string; fromMe?: boolean; remoteJid?: string }; text?: string; senderTimestampMs?: number }[]
  /** Structured selection from an interactive reply (button tap, list row or flow) */
  interactive?: {
    type: "button" | "list" | "flow"
    selectedId: string | null
    selectedText: string | null
    repliedToMessageId: string | null
  } | null
}

export interface Contact {
  id: string
  name?: string
  notify?: string
  verifiedName?: string
  imgUrl?: string | null
  status?: string
}

export interface Group {
  id: string
  subject: string
  owner?: string
  creation?: number
  participants: GroupParticipant[]
  desc?: string
}

export interface GroupParticipant {
  id: string
  admin?: 'admin' | 'superadmin' | null
}

export interface Channel {
  id: string
  name: string
  description?: string
  subscribersCount?: number
  verified?: boolean
}

export interface Label {
  id: string
  name: string
  color?: number
  count?: number
}

export interface Presence {
  id: string
  presences: Record<string, { lastKnownPresence: string }>
}

export interface WebhookFilterCondition {
  field: string
  operator: string
  value: string | string[] | boolean
  caseSensitive?: boolean
}

export interface Webhook {
  id: string
  enabled?: boolean
  method?: string
  url: string
  events: string[]
  hmac?: { key?: string }
  retries?: { attempts?: number; delaySeconds?: number; policy?: string }
  customHeaders?: { name: string; value: string }[]
  filters?: { conditions?: WebhookFilterCondition[] }
}

export interface RestApiKey {
  id: string
  session: string
  name: string
  prefix: string
  actions: string[]
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

const API_BASE = window.location.origin

function getDashboardAuth(): string | null {
  return localStorage.getItem("waha_dashboard_auth")
}

/**
 * Auth headers for every API call.
 *
 * The console signs in with the dashboard credentials, which the server accepts
 * as admin-equivalent. A real API key can be supplied through localStorage
 * (`waha-api-key`) for deployments that require one.
 *
 * We deliberately never send a placeholder key: a wrong `x-api-key` is rejected
 * before Basic auth is considered, so a hardcoded fallback breaks every request
 * on a server that has a real WAHA_API_KEY set.
 */
export function getApiAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  const dashboardAuth = getDashboardAuth()
  if (dashboardAuth) {
    headers["Authorization"] = `Basic ${dashboardAuth}`
  }
  const apiKey = localStorage.getItem("waha-api-key")
  if (apiKey) {
    headers["x-api-key"] = apiKey
  }
  return headers
}

/** Error from the API that preserves status + Retry-After for policy-blocked sends. */
export class ApiError extends Error {
  readonly status: number
  readonly retryAfterSeconds?: number

  constructor(message: string, status: number, retryAfterSeconds?: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...getApiAuthHeaders() }

  const res = await fetch(`${API_BASE}${path}`, {
    headers: { ...headers, ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Request failed" }))
    const header = Number(res.headers.get("Retry-After"))
    const retryAfterSeconds = typeof error.retryAfterSeconds === "number"
      ? error.retryAfterSeconds
      : Number.isFinite(header) && header > 0 ? header : undefined
    throw new ApiError(error.message || `HTTP ${res.status}`, res.status, retryAfterSeconds)
  }
  return res.json()
}

/** Fetch an image (blob) through the authenticated API, return an object URL */
export async function fetchImageBlobUrl(imageUrl: string): Promise<string | null> {
  if (!imageUrl) return null
  const url = imageUrl.startsWith("http") ? imageUrl : `${API_BASE}${imageUrl}`
  try {
    const res = await fetch(url, { headers: getApiAuthHeaders() })
    if (!res.ok) return null
    const blob = await res.blob()
    return URL.createObjectURL(blob)
  } catch {
    return null
  }
}

export interface SendingPolicyOverrides {
  maxPerMinute?: number
  maxPerHour?: number
  maxPerDay?: number
  newChatsPerDay?: number
  reachoutMinIntervalSeconds?: number
  warmupDays?: number
  warmupFloorPercent?: number
  /** 'HH:MM-HH:MM' local quiet window; '' disables quiet hours */
  quietHours?: string
  enabled?: boolean
}

export interface SendingPolicyUsage {
  counts: { lastMinute: number; lastHour: number; lastDay: number; newChatsLastDay: number }
  effective: {
    maxPerMinute: number
    maxPerHour: number
    maxPerDay: number
    newChatsPerDay: number
    reachoutMinIntervalSeconds: number
    warmupDays: number
    warmupFloorPercent: number
    quietHours: string
    enabled: boolean
  }
  warmup: { firstSeenAt: string | null; ageDays: number; factor: number }
  nextAllowedAt: {
    minuteCap: string | null
    hourCap: string | null
    dayCap: string | null
    newChatsPerDay: string | null
    reachout: string | null
    quietHours: string | null
  }
}

export interface SendingPolicyState {
  session: string
  bypassed: boolean
  overrides: SendingPolicyOverrides
  usage: SendingPolicyUsage
}

export const api = {
  // ==================== SESSIONS ====================
  getVersion: () => request<ServerVersion>("/api/version"),
  getSessions: () => request<Session[]>("/api/sessions"),
  getSession: (name: string) => request<Session>(`/api/sessions/${name}`),
  createSession: (name: string) =>
    request<Session>("/api/sessions", { method: "POST", body: JSON.stringify({ name }) }),
  createSessionWithConfig: (name: string, config?: Record<string, any>) =>
    request<Session>("/api/sessions", { method: "POST", body: JSON.stringify({ name, ...(config ? { config } : {}) }) }),
  startSession: (name: string) =>
    request<Session>(`/api/sessions/${name}/start`, { method: "POST" }),
  stopSession: (name: string) =>
    request<Session>(`/api/sessions/${name}/stop`, { method: "POST" }),
  restartSession: (name: string) =>
    request<Session>(`/api/sessions/${name}/restart`, { method: "POST" }),
  logoutSession: (name: string) =>
    request<Session>(`/api/sessions/${name}/logout`, { method: "POST" }),
  deleteSession: (name: string) =>
    request<void>(`/api/sessions/${name}`, { method: "DELETE" }),
  updateSession: (name: string, config: Record<string, any>) =>
    request<Session>(`/api/sessions/${name}`, { method: "PUT", body: JSON.stringify({ config }) }),
  getQRCode: (name: string) => request<QRCodeResponse>(`/api/${name}/auth/qr`),
  requestPairingCode: (session: string, phoneNumber: string) =>
    request<{ code?: string }>(`/api/${session}/auth/request-code`, {
      method: "POST",
      body: JSON.stringify({ phoneNumber }),
    }),
  getScreenshot: (name: string) => request<ScreenshotResponse>(`/api/${name}/screenshot`),
  getWorkers: () => request<Worker[]>("/api/workers"),
  getAudit: (params?: { limit?: number; offset?: number; severity?: string }) => {
    const q = new URLSearchParams()
    q.set("limit", String(params?.limit ?? 200))
    if (params?.offset) q.set("offset", String(params.offset))
    if (params?.severity && params.severity !== "all") q.set("severity", params.severity)
    return request<AuditEntry[]>(`/api/audit?${q}`)
  },

  // ==================== CHATS ====================
  getChats: (session: string, limit = 50, offset = 0) =>
    request<ChatOverview[]>(`/api/${session}/chats?limit=${limit}&offset=${offset}`),
  getChatsOverview: (session: string, limit = 50, offset = 0) =>
    request<ChatOverview[]>(`/api/${session}/chats/overview?limit=${limit}&offset=${offset}`),
  getMessages: (session: string, chatId: string, limit = 50, offset = 0) =>
    request<Message[]>(`/api/${session}/chats/${encodeURIComponent(chatId)}/messages?limit=${limit}&offset=${offset}&downloadMedia=false`),
  deleteChat: (session: string, chatId: string) =>
    request<void>(`/api/${session}/chats/${encodeURIComponent(chatId)}`, { method: "DELETE" }),
  readChatMessages: (session: string, chatId: string) =>
    request<any>(`/api/${session}/chats/${encodeURIComponent(chatId)}/read`, { method: "POST" }),
  getContactPicture: (session: string, contactId: string) =>
    request<{ profilePictureURL?: string }>(`/api/contacts/profile-picture?session=${encodeURIComponent(session)}&contactId=${encodeURIComponent(contactId)}`, { method: "GET" }),
  editMessage: (session: string, chatId: string, messageId: string, text: string) =>
    request<any>(`/api/${session}/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`, {
      method: "PUT",
      body: JSON.stringify({ text }),
    }),
  deleteMessage: (session: string, chatId: string, messageId: string) =>
    request<void>(`/api/${session}/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`, {
      method: "DELETE",
    }),
  pinMessage: (session: string, chatId: string, messageId: string) =>
    request<any>(`/api/${session}/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}/pin`, {
      method: "POST",
    }),
  unpinMessage: (session: string, chatId: string, messageId: string) =>
    request<any>(`/api/${session}/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}/unpin`, {
      method: "POST",
    }),
  archiveChat: (session: string, chatId: string) =>
    request<any>(`/api/${session}/chats/${encodeURIComponent(chatId)}/archive`, { method: "POST" }),
  unarchiveChat: (session: string, chatId: string) =>
    request<any>(`/api/${session}/chats/${encodeURIComponent(chatId)}/unarchive`, { method: "POST" }),
  unreadChat: (session: string, chatId: string) =>
    request<any>(`/api/${session}/chats/${encodeURIComponent(chatId)}/unread`, { method: "POST" }),

  // ==================== CHATTING ====================
  sendText: (session: string, chatId: string, text: string, replyTo?: string) =>
    request<any>("/api/sendText", {
      method: "POST",
      body: JSON.stringify({ session, chatId, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
    }),
  sendSeen: (session: string, chatId: string) =>
    request<any>("/api/sendSeen", {
      method: "POST",
      body: JSON.stringify({ session, chatId }),
    }),
  sendImage: (session: string, chatId: string, file: string | { mimetype: string; filename: string; data: string }, caption?: string) =>
    request<any>("/api/sendImage", {
      method: "POST",
      body: JSON.stringify({ session, chatId, file, caption }),
    }),
  sendFile: (session: string, chatId: string, file: string | { mimetype: string; filename: string; data: string }, caption?: string) =>
    request<any>("/api/sendFile", {
      method: "POST",
      body: JSON.stringify({ session, chatId, file, caption }),
    }),
  sendVoice: (session: string, chatId: string, file: string | { mimetype: string; filename: string; data: string }) =>
    request<any>("/api/sendVoice", {
      method: "POST",
      body: JSON.stringify({ session, chatId, file }),
    }),
  sendVideo: (session: string, chatId: string, file: string | { mimetype: string; filename: string; data: string }, caption?: string, replyTo?: string) =>
    request<any>("/api/sendVideo", {
      method: "POST",
      body: JSON.stringify({ session, chatId, file, caption, ...(replyTo ? { reply_to: replyTo } : {}) }),
    }),
  sendLocation: (session: string, chatId: string, latitude: number, longitude: number, title?: string) =>
    request<any>("/api/sendLocation", {
      method: "POST",
      body: JSON.stringify({ session, chatId, latitude, longitude, title }),
    }),
  sendPoll: (session: string, chatId: string, poll: any) =>
    request<any>("/api/sendPoll", {
      method: "POST",
      body: JSON.stringify({ session, chatId, poll }),
    }),
  sendButtons: (session: string, chatId: string, body: string, buttons: { id: string; text: string }[]) =>
    request<any>("/api/sendButtons", {
      method: "POST",
      body: JSON.stringify({
        session,
        chatId,
        body,
        buttons: buttons.map((b) => ({ type: "reply", id: b.id, text: b.text })),
      }),
    }),
  sendContactVcard: (session: string, chatId: string, contacts: any[]) =>
    request<any>("/api/sendContactVcard", {
      method: "POST",
      body: JSON.stringify({ session, chatId, contacts }),
    }),
  sendLinkPreview: (session: string, chatId: string, url: string, title?: string) =>
    request<any>("/api/sendLinkPreview", {
      method: "POST",
      body: JSON.stringify({ session, chatId, url, title }),
    }),
  startTyping: (session: string, chatId: string) =>
    request<void>("/api/startTyping", {
      method: "POST",
      body: JSON.stringify({ session, chatId }),
    }),
  stopTyping: (session: string, chatId: string) =>
    request<void>("/api/stopTyping", {
      method: "POST",
      body: JSON.stringify({ session, chatId }),
    }),
  setReaction: (session: string, chatId: string, messageId: string, reaction: string) =>
    request<any>("/api/reaction", {
      method: "PUT",
      body: JSON.stringify({ session, chatId, messageId, reaction }),
    }),
  setStar: (session: string, chatId: string, messageId: string, star: boolean) =>
    request<any>("/api/star", {
      method: "PUT",
      body: JSON.stringify({ session, chatId, messageId, star }),
    }),
  forwardMessage: (session: string, chatId: string, messageId: string) =>
    request<any>("/api/forwardMessage", {
      method: "POST",
      body: JSON.stringify({ session, chatId, messageId }),
    }),
  reply: (session: string, chatId: string, text: string, replyTo: string) =>
    request<any>("/api/reply", {
      method: "POST",
      body: JSON.stringify({ session, chatId, text, reply_to: replyTo }),
    }),
  checkNumberStatus: (session: string, phone: string) =>
    request<{ exists: boolean; isBusiness: boolean; canReceiveMessage: boolean; number: string }>(`/api/checkNumberStatus?session=${session}&phone=${phone}`),

  // ==================== CONTACTS ====================
  getContacts: (session: string, limit = 50, offset = 0) =>
    request<Contact[]>(`/api/contacts/all?session=${session}&limit=${limit}&offset=${offset}`),
  getContact: (session: string, contactId: string) =>
    request<Contact>(`/api/contacts?session=${session}&contactId=${contactId}`),
  blockContact: (session: string, contactId: string) =>
    request<any>("/api/contacts/block", {
      method: "POST",
      body: JSON.stringify({ session, contactId }),
    }),
  unblockContact: (session: string, contactId: string) =>
    request<any>("/api/contacts/unblock", {
      method: "POST",
      body: JSON.stringify({ session, contactId }),
    }),

  // ==================== GROUPS ====================
  getGroups: (session: string) =>
    request<Group[]>(`/api/${session}/groups`),
  createGroup: (session: string, name: string, participants: string[]) =>
    request<Group>("/api/" + session + "/groups", {
      method: "POST",
      body: JSON.stringify({ name, participants }),
    }),
  leaveGroup: (session: string, id: string) =>
    request<any>(`/api/${session}/groups/${id}/leave`, { method: "POST" }),
  getGroupParticipants: (session: string, id: string) =>
    request<GroupParticipant[]>(`/api/${session}/groups/${id}/participants`),
  addParticipants: (session: string, id: string, participants: string[]) =>
    request<any>(`/api/${session}/groups/${id}/participants/add`, {
      method: "POST",
      body: JSON.stringify({ participants }),
    }),
  removeParticipants: (session: string, id: string, participants: string[]) =>
    request<any>(`/api/${session}/groups/${id}/participants/remove`, {
      method: "POST",
      body: JSON.stringify({ participants }),
    }),
  setGroupDescription: (session: string, id: string, description: string) =>
    request<any>(`/api/${session}/groups/${id}/description`, {
      method: "PUT",
      body: JSON.stringify({ description }),
    }),
  setGroupSubject: (session: string, id: string, subject: string) =>
    request<any>(`/api/${session}/groups/${id}/subject`, {
      method: "PUT",
      body: JSON.stringify({ subject }),
    }),
  getInviteCode: (session: string, id: string) =>
    request<{ inviteCode: string }>(`/api/${session}/groups/${id}/invite-code`),

  // ==================== CHANNELS ====================
  getChannels: (session: string) =>
    request<Channel[]>(`/api/${session}/channels`),
  getChannel: (session: string, id: string) =>
    request<Channel>(`/api/${session}/channels/${id}`),
  followChannel: (session: string, id: string) =>
    request<any>(`/api/${session}/channels/${id}/follow`, { method: "POST" }),
  unfollowChannel: (session: string, id: string) =>
    request<any>(`/api/${session}/channels/${id}/unfollow`, { method: "POST" }),
  muteChannel: (session: string, id: string) =>
    request<any>(`/api/${session}/channels/${id}/mute`, { method: "POST" }),
  unmuteChannel: (session: string, id: string) =>
    request<any>(`/api/${session}/channels/${id}/unmute`, { method: "POST" }),

  // ==================== LABELS ====================
  getLabels: (session: string) =>
    request<Label[]>(`/api/${session}/labels`),
  putLabelsToChat: (session: string, chatId: string, labels: string[]) =>
    request<any>(`/api/${session}/labels/chats/${encodeURIComponent(chatId)}`, {
      method: "PUT",
      body: JSON.stringify({ labels }),
    }),
  getChatsByLabelId: (session: string, labelId: string) =>
    request<ChatOverview[]>(`/api/${session}/labels/${labelId}/chats`),

  // ==================== PROFILE ====================
  getProfile: (session: string) =>
    request<any>(`/api/${session}/profile`),
  setProfileName: (session: string, name: string) =>
    request<any>(`/api/${session}/profile/name`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    }),
  setProfileStatus: (session: string, status: string) =>
    request<any>(`/api/${session}/profile/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    }),

  // ==================== PRESENCE ====================
  setPresence: (session: string, presence: string, chatId?: string) =>
    request<any>(`/api/${session}/presence`, {
      method: "POST",
      body: JSON.stringify({ presence, chatId }),
    }),
  getPresences: (session: string) =>
    request<Presence[]>(`/api/${session}/presence`),
  /** Current presence for one chat (the chat id is usually the contact jid). */
  getPresence: (session: string, chatId: string) =>
    request<Presence>(`/api/${session}/presence/${encodeURIComponent(chatId)}`),
  /** Ask the engine to stream presence updates for this chat (typing/online). */
  subscribePresence: (session: string, chatId: string) =>
    request<{ result: boolean }>(`/api/${session}/presence/${encodeURIComponent(chatId)}/subscribe`, {
      method: "POST",
    }),

  // ==================== STATUS ====================
  postTextStatus: (session: string, text: string) =>
    request<any>(`/api/${session}/status/text`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  postImageStatus: (session: string, file: any, caption?: string) =>
    request<any>(`/api/${session}/status/image`, {
      method: "POST",
      body: JSON.stringify({ file, caption }),
    }),
  postVideoStatus: (session: string, file: any, caption?: string) =>
    request<any>(`/api/${session}/status/video`, {
      method: "POST",
      body: JSON.stringify({ file, caption }),
    }),
  postVoiceStatus: (session: string, file: any) =>
    request<any>(`/api/${session}/status/voice`, {
      method: "POST",
      body: JSON.stringify({ file }),
    }),
  deleteStatus: (session: string, messageId: string) =>
    request<any>(`/api/${session}/status/delete`, {
      method: "POST",
      body: JSON.stringify({ messageId }),
    }),

  // ==================== APPS ====================
  getApps: () => request<any[]>("/api/apps"),
  getApp: (id: string) => request<any>(`/api/apps/${id}`),
  createApp: (config: any) =>
    request<any>("/api/apps", { method: "POST", body: JSON.stringify(config) }),
  updateApp: (id: string, config: any) =>
    request<any>(`/api/apps/${id}`, { method: "PUT", body: JSON.stringify(config) }),
  deleteApp: (id: string) =>
    request<void>(`/api/apps/${id}`, { method: "DELETE" }),

  // ==================== LIDs ====================
  /** Resolve a LID to phone number */
  getLidPhoneNumber: (session: string, lid: string) =>
    request<string | null>(`/api/${session}/lids/${encodeURIComponent(lid)}`),
  /** Get all LID mappings */
  getLids: (session: string, limit = 200, offset = 0) =>
    request<any[]>(`/api/${session}/lids?limit=${limit}&offset=${offset}`),

  // ==================== INFRASTRUCTURE ====================
  getInfraConfig: () =>
    request<any>(`/api/infra/config`),
  saveInfraConfig: (config: any) =>
    request<any>(`/api/infra/config`, { method: "PUT", body: JSON.stringify(config) }),
  /** Try a PostgreSQL connection with the given settings before saving. */
  testDatabase: (database: any) =>
    request<{ ok: boolean; version?: string; message?: string }>(`/api/infra/database/test`, { method: "POST", body: JSON.stringify(database) }),
  restartServer: () =>
    request<any>(`/api/infra/restart`, { method: "POST" }),

  // ==================== WEBHOOKS ====================
  getWebhooks: (session: string) =>
    request<Webhook[]>(`/api/sessions/${session}/webhooks`),
  createWebhook: (session: string, config: any) =>
    request<Webhook>(`/api/sessions/${session}/webhooks`, { method: "POST", body: JSON.stringify(config) }),
  updateWebhook: (session: string, id: string, config: any) =>
    request<Webhook>(`/api/sessions/${session}/webhooks/${id}`, { method: "PUT", body: JSON.stringify(config) }),
  deleteWebhook: (session: string, id: string) =>
    request<void>(`/api/sessions/${session}/webhooks/${id}`, { method: "DELETE" }),
  testWebhook: (session: string, id: string) =>
    request<any>(`/api/sessions/${session}/webhooks/${id}/test`, { method: "POST" }),

  // ==================== SENDING POLICY ====================
  /** Anti-ban sending policy for a session: overrides + live usage counters */
  getSendingPolicy: (name: string) =>
    request<SendingPolicyState>(`/api/sessions/${name}/policy`),
  /** Replace the per-session policy overrides (an empty object clears them) */
  setSendingPolicy: (name: string, overrides: SendingPolicyOverrides) =>
    request<{ session: string; overrides: SendingPolicyOverrides; usage: SendingPolicyUsage }>(
      `/api/sessions/${name}/policy`,
      { method: "PUT", body: JSON.stringify(overrides) },
    ),

  // ==================== REST API KEYS ====================
  /** List per-session REST API key metadata (the hash is never returned) */
  getRestApiKeys: (name: string) =>
    request<{ keys: RestApiKey[] }>(`/api/sessions/${name}/api-keys`),
  /** Create a per-session REST API key (plaintext is returned once) */
  createRestApiKey: (name: string, body: { name?: string; actions?: string[] }) =>
    request<RestApiKey & { key: string; keyHash: string }>(`/api/sessions/${name}/api-keys`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  /** Revoke a per-session REST API key */
  revokeRestApiKey: (session: string, id: string) =>
    request<RestApiKey>(`/api/sessions/${session}/api-keys/${id}`, { method: "DELETE" }),
  /** Rotate a per-session REST API key (plaintext is returned once) */
  rotateRestApiKey: (session: string, id: string) =>
    request<RestApiKey & { key: string; keyHash: string }>(`/api/sessions/${session}/api-keys/${id}/rotate`, { method: "POST" }),

  // ==================== MCP ====================
  /** Get all registered MCP tools with categories */
  getMcpTools: () => request<{ tools: any[]; byCategory: Record<string, any[]> }>("/api/mcp/tools"),
  /** Get MCP config for a session */
  getSessionMcp: (name: string) =>
    request<{ enabled: boolean; allowedTools: string[]; deniedTools: string[]; destructiveOps: boolean }>(`/api/sessions/${name}/mcp`),
  /** Update MCP config for a session */
  updateSessionMcp: (name: string, config: { enabled?: boolean; allowedTools?: string[]; deniedTools?: string[]; destructiveOps?: boolean }) =>
    request<void>(`/api/sessions/${name}/mcp`, { method: "PUT", body: JSON.stringify(config) }),

  /** Generate a new per-session MCP key (returns plaintext once, stores hash) */
  generateMcpKey: (name: string) =>
    request<{ key: string; keyHash: string; connection: { stdio: { command: string; args: string[]; env: Record<string, string> }; http: { url: string; headers: Record<string, string> } } }>(
      `/api/sessions/${name}/mcp/generate-key`,
      { method: "POST" }
    ),
}
