import { useEffect, useState, useMemo, useRef } from "react"
import { Search, CircleDot, MessageSquarePlus, Play, CheckCheck, Plus, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { EmptyState, ErrorState, Skeleton } from "@/components/primitives"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { api, fetchImageBlobUrl, type Session, type ChatOverview, type Contact } from "@/lib/api"
import { cn } from "@/lib/utils"
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
  /** Set when the chats request failed because the session runs without a message store. */
  storeDisabled?: boolean
  onRetryChats?: () => void
  /** Collapse the panel to an icon rail (desktop). */
  collapsed?: boolean
  onToggleCollapse?: () => void
  /** chatId → presence state ("available" | "composing" | "recording" | "unavailable"…). */
  presences?: Map<string, string>
  /** chatId → typing state for the row preview ("composing" | "recording"). */
  typingMap?: Map<string, string>
}

/* Filter pills across the top of the list, as in the reference client. */
type ChatFilter = "all" | "unread" | "favourites" | "groups"

const FILTERS: { value: ChatFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "favourites", label: "Favourites" },
  { value: "groups", label: "Groups" },
]

function formatTime(ts: number): string {
  const d = new Date(ts * 1000)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday"
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diff < 7) return d.toLocaleDateString([], { weekday: "long" })
  return d.toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "numeric" })
}

/** Human label for a live typing state, shown in rows, rails and tooltips. */
function typingLabel(state?: string): string | undefined {
  if (state === "recording") return "recording audio…"
  if (state === "composing") return "typing…"
  return undefined
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
  storeDisabled,
  onRetryChats,
  collapsed = false,
  onToggleCollapse,
  presences,
  typingMap,
}: ChatConversationsProps) {
  const [chatSearch, setChatSearch] = useState("")
  const [filter, setFilter] = useState<ChatFilter>("all")
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

  const unreadTotal = chats.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0)

  const filteredChats = useMemo(() => {
    const query = chatSearch.trim().toLowerCase()
    return chats.filter((c) => {
      if (query && !chatName(c, contacts).toLowerCase().includes(query)) return false
      if (filter === "unread") return (c.unreadCount ?? 0) > 0
      if (filter === "groups") return c.id.endsWith("@g.us")
      // The overview route does not report favourites, so this list stays empty.
      if (filter === "favourites") return false
      return true
    })
  }, [chats, chatSearch, contacts, filter])

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

  const emptyCopy = filter === "unread"
    ? { title: "No unread chats", description: "Everything in this session has been read." }
    : filter === "favourites"
      ? { title: "No favourite chats", description: "This session does not report favourites yet." }
      : filter === "groups"
        ? { title: "No group chats", description: "Group conversations will appear here." }
        : chatSearch
          ? { title: "No matching conversations", description: "Try a different search term." }
          : { title: "No conversations yet", description: "Start a new chat or wait for incoming messages." }

  const sessionShort = (selectedSession || "?").slice(0, 2).toUpperCase()

  return (
    <aside
      className={cn(
        "flex h-full w-full shrink-0 flex-col border-r border-[var(--chat-border)] bg-[var(--chat-bg-sidebar)] transition-[width,max-width,min-width] duration-200",
        collapsed
          ? "md:w-[68px] md:min-w-[68px] md:max-w-[68px]"
          : "md:w-[30%] md:min-w-[320px] md:max-w-[440px]"
      )}
    >
      {/* ── Collapsed rail: chat icons only (desktop) ── */}
      {collapsed && (
        <div className="hidden h-full w-full flex-col items-center gap-1 py-2 md:flex">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Expand sidebar"
                variant="ghost"
                size="icon"
                className="size-9 shrink-0 rounded-full text-[var(--chat-text-secondary)] hover:bg-[var(--chat-bg-hover)] hover:text-[var(--chat-text-primary)]"
                onClick={onToggleCollapse}
              >
                <PanelLeftOpen className="size-[18px]" strokeWidth={1.75} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Expand sidebar</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="New chat"
                variant="ghost"
                size="icon"
                className="size-9 shrink-0 rounded-full bg-[var(--chat-bg-input)] text-[var(--chat-text-secondary)] hover:bg-[var(--chat-bg-hover)] hover:text-[var(--chat-text-primary)]"
                onClick={onOpenNewChat}
              >
                <Plus className="size-[18px]" strokeWidth={1.75} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">New chat</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Post status"
                variant="ghost"
                size="icon"
                className="size-9 shrink-0 rounded-full text-[var(--chat-text-secondary)] hover:bg-[var(--chat-bg-hover)] hover:text-[var(--chat-text-primary)]"
                onClick={onOpenStatus}
              >
                <CircleDot className="size-[18px]" strokeWidth={1.75} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Post status</TooltipContent>
          </Tooltip>

          <div className="my-1 h-px w-8 shrink-0 bg-[var(--chat-border)]" />

          {/* Chat icons */}
          <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-1.5 overflow-y-auto px-2 py-0.5">
            {loadingChats && !filteredChats.length ? (
              <div className="flex flex-col items-center gap-2 py-2" aria-hidden>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="size-11 rounded-full" />
                ))}
              </div>
            ) : (
              filteredChats.map((chat) => {
                const active = chat.id === selectedChatId
                const name = chatName(chat, contacts)
                const initials = chatInitials(chat, contacts)
                const color = avColor(chat.id, false)
                const unread = chat.unreadCount ?? 0
                const online = presences?.get(chat.id) === "available"
                const tLabel = typingLabel(typingMap?.get(chat.id))
                return (
                  <Tooltip key={chat.id}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => onSelectChat(chat.id)}
                        aria-label={name}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          "relative flex size-11 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          active && "ring-2 ring-[var(--chat-accent)] ring-offset-2 ring-offset-[var(--chat-bg-sidebar)]"
                        )}
                      >
                        <Avatar className="size-11">
                          <AvatarImage src={chat.picture || picturesCache.get(chat.id)} />
                          <AvatarFallback className="text-sm" style={{ background: color.bg, color: color.fg }}>
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        {online && (
                          <span className="absolute bottom-0.5 right-0.5 size-3 rounded-full border-2 border-[var(--chat-bg-sidebar)] bg-[var(--chat-green)]" />
                        )}
                        {unread > 0 && (
                          <span className="metric absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--chat-unread-bg)] px-1 text-[10px] font-bold text-[var(--chat-unread-text)]">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {name}
                      {tLabel ? <span className="text-[var(--chat-accent)]"> · {tLabel}</span> : null}
                    </TooltipContent>
                  </Tooltip>
                )
              })
            )}
          </div>

          {/* Session chip — click to expand and switch */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onToggleCollapse}
                aria-label="Switch session"
                className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--chat-bg-input)] text-[11px] font-bold text-[var(--chat-text-secondary)] transition-transform hover:scale-105"
              >
                {sessionShort}
                <span
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-[var(--chat-bg-sidebar)]",
                    isWorking ? "bg-[var(--chat-green)]" : "bg-[var(--chat-text-tertiary)]"
                  )}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {selectedSession} · {isWorking ? "working" : "stopped"} — click to expand
            </TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* ── Expanded panel ── */}
      <div className={cn("flex h-full w-full min-w-0 flex-col", collapsed && "md:hidden")}>
        {/* Header: account row plus the panel actions */}
        <div className="flex items-center gap-0.5 px-2 py-1.5">
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
          {onToggleCollapse && (
            <Tooltip><TooltipTrigger asChild>
              <Button
                aria-label="Collapse sidebar"
                variant="ghost"
                size="icon"
                className="hidden size-8 shrink-0 rounded-full text-[var(--chat-text-secondary)] hover:bg-[var(--chat-bg-hover)] hover:text-[var(--chat-text-primary)] md:inline-flex"
                onClick={onToggleCollapse}
              >
                <PanelLeftClose className="size-[18px]" strokeWidth={1.75} />
              </Button>
            </TooltipTrigger><TooltipContent>Collapse sidebar</TooltipContent></Tooltip>
          )}
          <Tooltip><TooltipTrigger asChild>
            <Button aria-label="Post status" variant="ghost" size="icon" className="size-8 shrink-0 rounded-full text-[var(--chat-text-secondary)] hover:bg-[var(--chat-bg-hover)] hover:text-[var(--chat-text-primary)]" onClick={onOpenStatus}>
              <CircleDot className="size-[18px]" strokeWidth={1.75} />
            </Button>
          </TooltipTrigger><TooltipContent>Post status</TooltipContent></Tooltip>
        </div>

        {/* Search */}
        <div className="px-3 pb-2 pt-1">
          <div className="flex items-center gap-2 rounded-full bg-[var(--chat-bg-input)] px-3 py-1.5">
            <Search className="size-4 shrink-0 text-[var(--chat-text-tertiary)]" strokeWidth={1.75} />
            <input
              placeholder="Search or start a new chat"
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
              disabled={!isWorking}
              className="min-w-0 flex-1 bg-transparent text-[14px] text-[var(--chat-text-primary)] placeholder:text-[var(--chat-text-tertiary)] focus:outline-none disabled:opacity-50"
            />
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-1.5 px-3 pb-2">
          {FILTERS.map((f) => {
            const active = filter === f.value
            return (
              <button
                key={f.value}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(f.value)}
                className={`flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  active
                    ? "bg-[var(--chat-accent-soft)] font-medium text-[var(--chat-accent)]"
                    : "bg-[var(--chat-bg-input)] text-[var(--chat-text-secondary)] hover:text-[var(--chat-text-primary)]"
                }`}
              >
                {f.label}
                {f.value === "unread" && unreadTotal > 0 && (
                  <span className="metric flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--chat-unread-bg)] px-1 text-[10px] font-bold text-[var(--chat-unread-text)]">
                    {unreadTotal > 99 ? "99+" : unreadTotal}
                  </span>
                )}
              </button>
            )
          })}
          <Tooltip><TooltipTrigger asChild>
            <Button
              aria-label="New chat"
              variant="ghost"
              size="icon"
              className="ml-auto size-8 shrink-0 rounded-full bg-[var(--chat-bg-input)] text-[var(--chat-text-secondary)] hover:bg-[var(--chat-bg-hover)] hover:text-[var(--chat-text-primary)]"
              onClick={onOpenNewChat}
            >
              <Plus className="size-[18px]" strokeWidth={1.75} />
            </Button>
          </TooltipTrigger><TooltipContent>New chat</TooltipContent></Tooltip>
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
                  <Skeleton className="size-12 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : storeDisabled ? (
            <div className="px-2 py-2">
              <ErrorState
                compact
                title="Chat history is unavailable"
                description="This session is running without a message store, so BunWa cannot read chats, messages or contacts. Enable the store in the session settings and restart the session. History backfill also needs full sync enabled."
                onRetry={onRetryChats}
              />
            </div>
          ) : filteredChats.length === 0 ? (
            <EmptyState
              compact
              icon={<MessageSquarePlus className="size-5" strokeWidth={1.75} />}
              title={emptyCopy.title}
              description={emptyCopy.description}
            />
          ) : (
            <div className="px-1.5 py-1">
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
                const unread = chat.unreadCount ?? 0
                const online = presences?.get(chat.id) === "available"
                const tLabel = typingLabel(typingMap?.get(chat.id))
                return (
                  <button
                    key={chat.id}
                    onClick={() => onSelectChat(chat.id)}
                    aria-current={active ? "true" : undefined}
                    className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                      active
                        ? "bg-[var(--chat-bg-selected)]"
                        : "hover:bg-[var(--chat-bg-hover)]"
                    }`}
                  >
                    <div className="relative shrink-0">
                      <Avatar className="size-[49px]">
                        <AvatarImage src={chat.picture || picturesCache.get(chat.id)} />
                        <AvatarFallback className="text-sm" style={{ background: color.bg, color: color.fg }}>
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      {online && (
                        <span className="absolute bottom-0.5 right-0.5 size-3 rounded-full border-2 border-[var(--chat-bg-sidebar)] bg-[var(--chat-green)]" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[15px] font-normal leading-[21px] text-[var(--chat-text-primary)]">
                          {name}
                        </span>
                        {chat.lastMessage && (
                          <span className="metric shrink-0 text-[12px] leading-[21px] text-[var(--chat-text-secondary)]">
                            {formatTime(chat.lastMessage.timestamp)}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1 text-[13px] leading-[18px]">
                          {tLabel ? (
                            <span className="truncate font-medium text-[var(--chat-accent)]">{tLabel}</span>
                          ) : (
                            <>
                              {chat.lastMessage?.fromMe && (
                                <CheckCheck className="size-4 shrink-0 text-[var(--chat-text-tertiary)]" strokeWidth={1.75} />
                              )}
                              <span className="truncate text-[var(--chat-text-secondary)]">{chat.lastMessage?.body || ""}</span>
                            </>
                          )}
                        </span>
                        {unread > 0 && (
                          <span className="metric flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-[var(--chat-unread-bg)] px-1 text-[11px] font-bold text-[var(--chat-unread-text)]">
                            {unread > 99 ? "99+" : unread}
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
      </div>
    </aside>
  )
}
