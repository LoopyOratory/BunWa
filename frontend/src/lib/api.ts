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

const API_BASE = window.location.origin

function getDashboardAuth(): string | null {
  return localStorage.getItem("waha_dashboard_auth")
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }

  const dashboardAuth = getDashboardAuth()
  if (dashboardAuth) {
    headers["Authorization"] = `Basic ${dashboardAuth}`
  }
  headers["x-api-key"] = "waha"

  const res = await fetch(`${API_BASE}${path}`, {
    headers: { ...headers, ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Request failed" }))
    throw new Error(error.message || `HTTP ${res.status}`)
  }
  return res.json()
}

/** Fetch an image (blob) through the authenticated API, return an object URL */
export async function fetchImageBlobUrl(imageUrl: string): Promise<string | null> {
  if (!imageUrl) return null
  const url = imageUrl.startsWith("http") ? imageUrl : `${API_BASE}${imageUrl}`
  try {
    const headers: Record<string, string> = {}
    const dashboardAuth = getDashboardAuth()
    if (dashboardAuth) headers["Authorization"] = `Basic ${dashboardAuth}`
    headers["x-api-key"] = "waha"
    const res = await fetch(url, { headers })
    if (!res.ok) return null
    const blob = await res.blob()
    return URL.createObjectURL(blob)
  } catch {
    return null
  }
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
    request<any[]>(`/api/${session}/lids/?limit=${limit}&offset=${offset}`),

  // ==================== MCP ====================
  /** Get all registered MCP tools with categories */
  getMcpTools: () => request<{ tools: any[]; byCategory: Record<string, any[]> }>("/api/mcp/tools"),
  /** Get MCP config for a session */
  getSessionMcp: (name: string) =>
    request<{ enabled: boolean; allowedTools: string[]; deniedTools: string[]; destructiveOps: boolean }>(`/api/sessions/${name}/mcp`),
  /** Update MCP config for a session */
  updateSessionMcp: (name: string, config: { enabled?: boolean; allowedTools?: string[]; deniedTools?: string[]; destructiveOps?: boolean }) =>
    request<void>(`/api/sessions/${name}/mcp`, { method: "PUT", body: JSON.stringify(config) }),
}
