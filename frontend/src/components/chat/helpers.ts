import { ApiError, type ChatOverview, type Contact, type Message } from "@/lib/api"
import type { ChatMessageData, SidebarConversation } from "@/components/ui/chat"
import { toast } from "sonner"

const AV_COLORS = [
  { bg: "#d1fae5", fg: "#065f46", darkBg: "#1a3020", darkFg: "#4ade80" },
  { bg: "#dbeafe", fg: "#1e40af", darkBg: "#1a2030", darkFg: "#60a5fa" },
  { bg: "#ede9fe", fg: "#5b21b6", darkBg: "#22183a", darkFg: "#a78bfa" },
  { bg: "#fef3c7", fg: "#92400e", darkBg: "#2a1e0f", darkFg: "#fbbf24" },
  { bg: "#fee2e2", fg: "#991b1b", darkBg: "#2a1515", darkFg: "#f87171" },
  { bg: "#ccfbf1", fg: "#115e59", darkBg: "#0f2520", darkFg: "#2dd4bf" },
  { bg: "#fce7f3", fg: "#9d174d", darkBg: "#2a1525", darkFg: "#f472b6" },
]

export function avColor(id: string, isDark: boolean) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0
  const c = AV_COLORS[Math.abs(h) % AV_COLORS.length]
  return isDark ? { bg: c.darkBg, fg: c.darkFg } : { bg: c.bg, fg: c.fg }
}

/* The contacts route maps the stored `notify` field to `pushname` before the
   payload reaches the client, so a name lookup must accept both spellings. */
type ContactWithPushname = Contact & { pushname?: string | null }

export function chatName(chat: ChatOverview, contactsMap?: Map<string, Contact>): string {
  if (chat.name) return chat.name
  if (contactsMap) {
    for (const [, contact] of contactsMap) {
      if (contact.id !== chat.id) continue
      const named = contact as ContactWithPushname
      return named.name || named.notify || named.pushname || chatAddress(chat, contactsMap)
    }
  }
  return chatAddress(chat, contactsMap)
}

/** The address line for a chat: its WhatsApp username when one is known,
 *  otherwise the local part of the JID (the phone number or LID). */
export function chatAddress(chat: ChatOverview, contactsMap?: Map<string, Contact>): string {
  const contact = contactsMap?.get(chat.id) as ContactWithPushname | undefined
  const username = chat.username || contact?.username
  if (username) return `@${username.replace(/^@/, "")}`
  return chat.id.split("@")[0] || chat.id
}

export function chatInitials(chat: ChatOverview, contactsMap?: Map<string, Contact>): string {
  const name = chatName(chat, contactsMap)
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

/*
 * Timestamps arrive in more than one shape: the WhatsApp protocol measures in
 * seconds, the browser engine in milliseconds, and a stored row may hand the
 * number over as a string. Values below the millisecond epoch threshold are
 * therefore treated as seconds, so a seconds value is never read as 1970 and a
 * millisecond value is never multiplied a second time. Returns null when the
 * value is absent or unparseable so callers can omit the label instead of
 * printing Invalid Date.
 */
export function toEpochMs(value: unknown): number | null {
  if (value === null || value === undefined) return null
  let numeric: number
  if (value instanceof Date) numeric = value.getTime()
  else if (typeof value === "number") numeric = value
  else if (typeof value === "string") {
    const text = value.trim()
    if (!text) return null
    if (/^-?\d+(\.\d+)?$/.test(text)) numeric = Number(text)
    else {
      const parsed = Date.parse(text)
      return Number.isFinite(parsed) ? parsed : null
    }
  } else return null
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  // 1e12 ms is 2001; protocol seconds (~1e9) sit far below it.
  return numeric < 1e12 ? Math.round(numeric * 1000) : Math.round(numeric)
}

/** Row label: clock time for today, "Yesterday", a short absolute date otherwise. */
export function formatChatTime(value: unknown): string | null {
  const ms = toEpochMs(value)
  if (ms === null) return null
  const date = new Date(ms)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday"
  return date.toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "numeric" })
}

/* The overview exposes the last message in engine-specific shapes: normalized
   clients set `timestamp`, while the raw noweb row names it
   `messageTimestamp`. Accept either so the row still gets a label. */
type RawLastMessage = {
  messageTimestamp?: unknown
  pushName?: string | null
  key?: { remoteJidUsername?: string | null; participantUsername?: string | null }
}

export function lastMessageTimeMs(last: ChatOverview["lastMessage"] | null | undefined): number | null {
  if (!last) return null
  const raw = last as ChatOverview["lastMessage"] & RawLastMessage
  return toEpochMs(raw.timestamp) ?? toEpochMs(raw.messageTimestamp)
}

const statusMap: Record<number, "sending" | "sent" | "delivered" | "read" | "failed"> = {
  0: "sending",
  1: "sent",
  2: "delivered",
  3: "read",
}

export function resolveUserJid(session: { me?: { id?: string } }): string {
  if (!session.me?.id) return ""
  if (session.me.id.includes("@")) return session.me.id
  return `${session.me.id}@s.whatsapp.net`
}

export function mapMessage(msg: Message, contactsMap: Map<string, Contact>, currentUserJid: string): ChatMessageData {
  const senderId = msg.fromMe ? currentUserJid : msg.from
  const sender = contactsMap.get(msg.from) as ContactWithPushname | undefined
  // The raw stored message still carries the sender's push name for senders
  // the contacts store has not resolved yet.
  const raw = (msg as Message & { _data?: RawLastMessage })._data
  const rawUsername = raw?.key?.remoteJidUsername || raw?.key?.participantUsername
  const username = msg.username || (typeof rawUsername === "string" ? rawUsername : undefined)
  const senderName = msg.fromMe
    ? "You"
    : sender?.name || sender?.notify || sender?.pushname || raw?.pushName || (username ? `@${username.replace(/^@/, "")}` : msg.from.split("@")[0])

  const reactionMap = new Map<string, { emoji: string; userIds: string[]; count: number }>()
  for (const r of msg.reactions || []) {
    const e = r.text as string
    if (!e) continue
    const existing = reactionMap.get(e)
    const isCurrentUser = r.key?.fromMe === true || r.senderTimestampMs !== undefined
    if (existing) {
      existing.count++
      if (isCurrentUser) existing.userIds.push(currentUserJid)
    } else {
      reactionMap.set(e, {
        emoji: e,
        userIds: isCurrentUser ? [currentUserJid] : [],
        count: 1,
      })
    }
  }

  /* Poll messages carry their question and choices in a `poll` field; option
     entries are objects on some engines and plain strings on others. */
  const rawPoll = (msg as unknown as { poll?: { name?: string; question?: string; options?: unknown[]; multipleAnswers?: boolean; selectableCount?: number } }).poll
  const poll = rawPoll && typeof rawPoll === "object" && (rawPoll.name || rawPoll.question)
    ? {
        name: String(rawPoll.name || rawPoll.question),
        options: (Array.isArray(rawPoll.options) ? rawPoll.options : [])
          .map((o) => (typeof o === "string" ? o : String((o as { name?: string; text?: string })?.name ?? (o as { text?: string })?.text ?? "")))
          .filter(Boolean),
        multipleAnswers: !!(rawPoll.multipleAnswers ?? ((rawPoll.selectableCount ?? 1) > 1)),
      }
    : undefined

  return {
    id: msg.id,
    senderId,
    senderName,
    timestamp: msg.timestamp * 1000,
    text: msg.body,
    status: msg.ack !== undefined ? statusMap[msg.ack] || "sent" : "sent",
    replyTo: msg.replyTo ? { id: msg.replyTo as string, senderName: "", text: "" } : undefined,
    reactions: Array.from(reactionMap.values()),
    isEdited: false,
    interactive: msg.interactive ?? undefined,
    poll,
  }
}

export function mapConversation(chat: ChatOverview, contactsMap: Map<string, Contact>): SidebarConversation {
  const name = chatName(chat, contactsMap)
  const lastMessageMs = lastMessageTimeMs(chat.lastMessage)
  return {
    id: chat.id,
    title: name,
    avatar: chat.picture,
    lastMessage: chat.lastMessage?.body,
    lastMessageTime: lastMessageMs !== null ? formatChatTime(lastMessageMs) ?? undefined : undefined,
    unreadCount: chat.unreadCount || 0,
  }
}

/**
 * Human message for a failed send. A 429 means the anti-ban sending policy
 * blocked the request; the server message already names the reason and the
 * retry delay, so surface it verbatim instead of a generic failure.
 */
export function sendErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.status === 429) return error.message
  return fallback
}

/** Toast for a failed send, policy-aware. */
export function showSendError(error: unknown, fallback = "Failed to send"): void {
  toast.error(sendErrorMessage(error, fallback))
}
