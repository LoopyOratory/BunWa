import type { ChatOverview, Contact, Message } from "@/lib/api"
import type { ChatMessageData, SidebarConversation } from "@/components/ui/chat"

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

export function chatName(chat: ChatOverview, contactsMap?: Map<string, Contact>): string {
  if (chat.name) return chat.name
  if (contactsMap) {
    for (const [, contact] of contactsMap) {
      if (contact.id === chat.id) return contact.name || contact.notify || chat.id.split("@")[0]
    }
  }
  return chat.id.split("@")[0] || chat.id
}

export function chatInitials(chat: ChatOverview, contactsMap?: Map<string, Contact>): string {
  const name = chatName(chat, contactsMap)
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diff < 7) return d.toLocaleDateString([], { weekday: "short" })
  return d.toLocaleDateString([], { month: "short", day: "numeric" })
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
  const senderName = msg.fromMe
    ? "You"
    : contactsMap.get(msg.from)?.name || contactsMap.get(msg.from)?.notify || msg.from.split("@")[0]

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
  }
}

export function mapConversation(chat: ChatOverview, contactsMap: Map<string, Contact>): SidebarConversation {
  const name = chatName(chat, contactsMap)
  return {
    id: chat.id,
    title: name,
    avatar: chat.picture,
    lastMessage: chat.lastMessage?.body,
    lastMessageTime: chat.lastMessage ? formatTime(chat.lastMessage.timestamp) : undefined,
    unreadCount: chat.unreadCount || 0,
  }
}
