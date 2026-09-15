import { useEffect, useState, useMemo, useRef } from "react"
import { Search, CircleDot, MessageSquarePlus, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { EmptyState, ErrorState, Skeleton } from "@/components/primitives"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { api, fetchImageBlobUrl, type Session, type ChatOverview, type Contact } from "@/lib/api"
import { SessionSelector } from "./session-selector"
import { avColor, chatName, chatInitials } from "./helpers"

interface ChatConversationsProps {
  sessions: Session[]
  selectedSession: string
  onSessionChange: (name: string) => void
  onStartSession: (name: string) => void
  onStopSession: (name: string) => void
  isWorking: boolean
  chats: ChatOverview[]
  contacts: Map<string, Contact>
  selectedChatId: string | null
  onSelectChat: (chatId: string) => void
  loadingChats: boolean
  userPicture: string | null
  onOpenNewChat: () => void
  onOpenStatus: () => void
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diff < 7) return d.toLocaleDateString([], { weekday: "short" })
  return d.toLocaleDateString([], { month: "short", day: "numeric" })
}

export function ChatConversations({
  sessions,
  selectedSession,
  onSessionChange,
  onStartSession,
  onStopSession,
  isWorking,
  chats,
  contacts,
  selectedChatId,
  onSelectChat,
  loadingChats,
  onOpenNewChat,
  onOpenStatus,
}: ChatConversationsProps) {
  const [chatSearch, setChatSearch] = useState("")
  const [picturesCache, setPicturesCache] = useState<Map<string, string>>(new Map())
  const [picturesError, setPicturesError] = useState(false)
  const [picturesRetry, setPicturesRetry] = useState(0)
  const cacheRef = useRef(picturesCache)
  cacheRef.current = picturesCache
  useEffect(() => () => {
    for (const url of cacheRef.current.values()) {
      if (url.startsWith("blob:")) URL.revokeObjectURL(url)
    }
  }, [])

  const filteredChats = useMemo(
    () => chats.filter((c) => !chatSearch || chatName(c, contacts).toLowerCase().includes(chatSearch.toLowerCase())),
    [chats, chatSearch, contacts]
  )

  useEffect(() => {
    if (!selectedSession) return
    const ids = filteredChats.filter((c) => !c.picture).map((c) => c.id)
    let cancelled = false
    const fetchPics = async () => {
      const newCache = new Map(picturesCache)
      let failed = false
      for (const id of ids) {
        if (newCache.has(id)) continue
        const contact = contacts.get(id)
        if (contact?.imgUrl) { newCache.set(id, contact.imgUrl); continue }
        try {
          const res = await api.getContactPicture(selectedSession, id)
          if (res.profilePictureURL && !cancelled) {
            const blobUrl = await fetchImageBlobUrl(res.profilePictureURL)
            if (blobUrl && !cancelled) newCache.set(id, blobUrl)
          }
        } catch { failed = true }
      }
      if (!cancelled) {
        setPicturesCache(newCache)
        setPicturesError(failed)
      }
    }
    fetchPics()
    return () => { cancelled = true }
  }, [filteredChats, selectedSession, contacts, picturesRetry])

  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-r border-[var(--chat-border-strong)] bg-[var(--chat-bg-sidebar)] sm:w-80">
      <div className="flex items-center gap-1 px-3 pt-3 pb-1.5">
        <SidebarTrigger className="md:hidden shrink-0" />
        <div className="min-w-0 flex-1">
          <SessionSelector
            sessions={sessions}
            selectedSession={selectedSession}
            onSessionChange={onSessionChange}
            onStartSession={onStartSession}
            onStopSession={onStopSession}
          />
        </div>
      </div>

      <div className="flex items-center justify-between px-4 py-1">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-bold tracking-tight text-[var(--chat-text-primary)]">Messages</span>
          {chats.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0) > 0 && (
            <span className="metric flex size-[18px] items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {chats.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0) > 99 ? "99+" : chats.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0)}
            </span>
          )}
        </div>
        <div className="flex gap-0.5">
          <Tooltip><TooltipTrigger asChild>
            <Button aria-label="Post status" variant="ghost" size="icon" className="size-7 text-[var(--chat-text-secondary)] hover:text-[var(--chat-text-primary)] hover:bg-[var(--chat-accent-soft)]" onClick={onOpenStatus}>
              <CircleDot className="size-3.5" strokeWidth={1.75} />
            </Button>
          </TooltipTrigger><TooltipContent>Post status</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild>
            <Button aria-label="New chat" variant="ghost" size="icon" className="size-7 text-[var(--chat-text-secondary)] hover:text-[var(--chat-text-primary)] hover:bg-[var(--chat-accent-soft)]" onClick={onOpenNewChat}>
              <MessageSquarePlus className="size-3.5" strokeWidth={1.75} />
            </Button>
          </TooltipTrigger><TooltipContent>New chat</TooltipContent></Tooltip>
        </div>
      </div>

      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 rounded-[10px] bg-[var(--chat-bg-main)] px-3 py-2">
          <Search className="size-3.5 text-[var(--chat-text-tertiary)]" />
          <input
            placeholder="Search conversations"
            value={chatSearch}
            onChange={(e) => setChatSearch(e.target.value)}
            disabled={!isWorking}
            className="flex-1 bg-transparent text-[13px] text-[var(--chat-text-primary)] placeholder:text-[var(--chat-text-tertiary)] focus:outline-none disabled:opacity-50"
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {!isWorking ? (
          <EmptyState
            compact
            icon={<Play className="size-5" strokeWidth={1.75} />}
            title="Session not connected"
            description="Start the session above to view conversations."
          />
        ) : loadingChats ? (
          <div className="space-y-3 p-3" aria-hidden>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-11 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredChats.length === 0 ? (
          <EmptyState
            compact
            icon={<MessageSquarePlus className="size-5" strokeWidth={1.75} />}
            title={chatSearch ? "No matching conversations" : "No conversations yet"}
            description={chatSearch ? "Try a different search term." : "Start a new chat or wait for incoming messages."}
          />
        ) : (
          <div className="px-1 py-1">
            {picturesError && (
              <div className="px-2 pb-2">
                <ErrorState
                  compact
                  title="Some profile pictures could not be loaded"
                  onRetry={() => {
                    setPicturesError(false)
                    setPicturesRetry((n) => n + 1)
                  }}
                />
              </div>
            )}
            {filteredChats.map((chat) => {
              const active = chat.id === selectedChatId
              const name = chatName(chat, contacts)
              const initials = chatInitials(chat, contacts)
              const color = avColor(chat.id, false)
              return (
                <button
                  key={chat.id}
                  onClick={() => onSelectChat(chat.id)}
                  aria-current={active ? "true" : undefined}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                    active ? "bg-[var(--chat-accent-soft)]" : "hover:bg-[var(--chat-accent-soft)]"
                  }`}
                >
                  <div className="relative shrink-0">
                    <Avatar className="size-11">
                      <AvatarImage src={chat.picture || picturesCache.get(chat.id)} />
                      <AvatarFallback className="text-xs font-semibold" style={{ background: color.bg, color: color.fg }}>
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className={`truncate text-[14px] ${chat.unreadCount && chat.unreadCount > 0 ? "font-bold" : "font-semibold"} text-[var(--chat-text-primary)]`}>
                        {name}
                      </span>
                      {chat.lastMessage && (
                        <span className="metric ml-2 shrink-0 text-[11px] text-[var(--chat-text-tertiary)]">
                          {formatTime(chat.lastMessage.timestamp)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="truncate text-[12px] text-[var(--chat-text-secondary)]">
                        {chat.lastMessage?.body || ""}
                      </span>
                      {(chat.unreadCount ?? 0) > 0 && (
                        <span className="metric ml-2 flex size-[18px] shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                          {chat.unreadCount! > 99 ? "99+" : chat.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </ScrollArea>
    </aside>
  )
}
