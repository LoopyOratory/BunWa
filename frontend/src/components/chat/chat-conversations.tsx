import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Search, CircleDot, MessageSquarePlus, CheckCheck, Plus, PanelLeftClose, PanelLeftOpen, Loader2, Gauge } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { EmptyState, ErrorState, Skeleton } from "@/components/primitives"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { SidebarTrigger } from "@/components/ui/sidebar"
import type { Session, ChatOverview, Contact } from "@/lib/api"
import {
  DATABASE_UNREACHABLE_DESCRIPTION,
  DATABASE_UNREACHABLE_TITLE,
  STORE_DISABLED_DESCRIPTION,
  STORE_DISABLED_TITLE,
  type StoreFailure,
} from "@/lib/chat-errors"
import { cn } from "@/lib/utils"
import { SessionSelector } from "./session-selector"
import { avColor, chatName, chatInitials, formatChatTime, lastMessageTimeMs } from "./helpers"

export interface AvatarSource {
  get: (id: string) => string | undefined
  request: (ids: string[]) => void
}

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
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
  avatars: AvatarSource
  onOpenNewChat: () => void
  onOpenStatus: () => void
  /** Why the chat list could not be read, when it could not. */
  failure: StoreFailure | null
  onRetryChats: () => void
  /** Shown instead of the list while the session is not connected. */
  connectPanel: ReactNode
  limitLabel?: { text: string; tone: "ok" | "warning" | "error" } | null
  /** Collapse the panel to an icon rail (desktop). */
  collapsed?: boolean
  onToggleCollapse?: () => void
  /** chatId → presence state ("available" | "composing" | "recording" | "unavailable"…). */
  presences?: Map<string, string>
  /** chatId → typing state for the row preview ("composing" | "recording"). */
  typingMap?: Map<string, string>
}

type ChatFilter = "all" | "unread" | "groups"

/** Row height in px; fixed so the list can be windowed. */
const ROW_HEIGHT = 64

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
  hasMore,
  loadingMore,
  onLoadMore,
  avatars,
  onOpenNewChat,
  onOpenStatus,
  failure,
  onRetryChats,
  connectPanel,
  limitLabel,
  collapsed = false,
  onToggleCollapse,
  presences,
  typingMap,
}: ChatConversationsProps) {
  const [chatSearch, setChatSearch] = useState("")
  const [filter, setFilter] = useState<ChatFilter>("all")
  const scrollRef = useRef<HTMLDivElement>(null)

  const unreadTotal = useMemo(() => chats.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0), [chats])

  const filteredChats = useMemo(() => {
    const query = chatSearch.trim().toLowerCase()
    return chats.filter((c) => {
      if (query && !chatName(c, contacts).toLowerCase().includes(query) && !c.id.includes(query)) return false
      if (filter === "unread") return (c.unreadCount ?? 0) > 0
      if (filter === "groups") return c.id.endsWith("@g.us")
      return true
    })
  }, [chats, chatSearch, contacts, filter])

  // Only the rows on screen are rendered.
  const virtualizer = useVirtualizer({
    count: filteredChats.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  })
  const virtualRows = virtualizer.getVirtualItems()
  const firstVisible = virtualRows[0]?.index ?? 0
  const lastVisible = virtualRows[virtualRows.length - 1]?.index ?? -1

  // Pictures for the rows on screen; more pages as the reader nears the end.
  useEffect(() => {
    if (lastVisible < 0) return
    avatars.request(filteredChats.slice(firstVisible, lastVisible + 1).filter((c) => !c.picture).map((c) => c.id))
    if (hasMore && !loadingMore && lastVisible >= filteredChats.length - 10) onLoadMore()
  }, [firstVisible, lastVisible, filteredChats, avatars, hasMore, loadingMore, onLoadMore])

  // The collapsed rail shows every chat icon; ask for their pictures too.
  useEffect(() => {
    if (collapsed) avatars.request(filteredChats.slice(0, 40).filter((c) => !c.picture).map((c) => c.id))
  }, [collapsed, filteredChats, avatars])

  const emptyCopy = filter === "unread"
    ? { title: "No unread chats", description: "Everything in this session has been read." }
    : filter === "groups"
      ? { title: "No group chats", description: "Group conversations will appear here." }
      : chatSearch
        ? { title: "No matching conversations", description: "Try a different name or number, or start a new chat." }
        : { title: "No conversations yet", description: "Start a new chat or wait for incoming messages." }

  const sessionShort = (selectedSession || "?").slice(0, 2).toUpperCase()
  const pictureOf = (chat: ChatOverview) => chat.picture || contacts.get(chat.id)?.imgUrl || avatars.get(chat.id)

  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-r border-[var(--chat-border)] bg-[var(--chat-bg-sidebar)]">
      {/* ── Collapsed rail: chat icons only (desktop) ── */}
      {collapsed && (
        <div className="hidden h-full w-full flex-col items-center gap-1 pb-2 md:flex">
          <div className="flex h-[var(--chat-header-height)] w-full shrink-0 items-center justify-center border-b border-[var(--chat-border)] bg-[var(--chat-bg-header)]">
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
          </div>

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

          <div className="my-1 h-px w-8 shrink-0 bg-[var(--chat-border)]" />

          <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-1.5 overflow-y-auto px-2 py-0.5">
            {loadingChats && !filteredChats.length ? (
              <div className="flex flex-col items-center gap-2 py-2" aria-hidden>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="size-10 rounded-full" />
                ))}
              </div>
            ) : (
              filteredChats.slice(0, 40).map((chat) => {
                const active = chat.id === selectedChatId
                const name = chatName(chat, contacts)
                const color = avColor(chat.id, false)
                const unread = chat.unreadCount ?? 0
                const tLabel = typingLabel(typingMap?.get(chat.id))
                return (
                  <Tooltip key={chat.id}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => onSelectChat(chat.id)}
                        aria-label={name}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          "relative flex size-10 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          active && "ring-2 ring-[var(--chat-accent)] ring-offset-2 ring-offset-[var(--chat-bg-sidebar)]",
                        )}
                      >
                        <Avatar className="size-10">
                          <AvatarImage src={pictureOf(chat)} />
                          <AvatarFallback className="text-sm" style={{ background: color.bg, color: color.fg }}>
                            {chatInitials(chat, contacts)}
                          </AvatarFallback>
                        </Avatar>
                        {unread > 0 && (
                          <span className="metric absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--chat-unread-bg)] px-1 text-[10px] font-bold text-[var(--chat-unread-text)]">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {name}
                      {tLabel ? <span> · {tLabel}</span> : null}
                    </TooltipContent>
                  </Tooltip>
                )
              })
            )}
          </div>

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
                    isWorking ? "bg-[var(--chat-green)]" : "bg-[var(--chat-text-tertiary)]",
                  )}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {selectedSession} · {isWorking ? "connected" : "not connected"}. Click to expand.
            </TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* ── Expanded panel ── */}
      <div className={cn("flex h-full w-full min-w-0 flex-col", collapsed && "md:hidden")}>
        {/* Session context: which number this is, whether it is connected and
            how close it is to its sending limit. */}
        <div className="flex h-[var(--chat-header-height)] shrink-0 items-center gap-0.5 border-b border-[var(--chat-border)] bg-[var(--chat-bg-header)] px-2">
          <SidebarTrigger className="shrink-0 md:hidden" />
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="Collapse sidebar"
                  variant="ghost"
                  size="icon"
                  className="hidden size-8 shrink-0 rounded-full text-[var(--chat-text-secondary)] hover:bg-[var(--chat-bg-hover)] hover:text-[var(--chat-text-primary)] md:inline-flex"
                  onClick={onToggleCollapse}
                >
                  <PanelLeftClose className="size-[18px]" strokeWidth={1.75} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Collapse sidebar</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Post status"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 rounded-full text-[var(--chat-text-secondary)] hover:bg-[var(--chat-bg-hover)] hover:text-[var(--chat-text-primary)]"
                onClick={onOpenStatus}
                disabled={!isWorking}
              >
                <CircleDot className="size-[18px]" strokeWidth={1.75} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Post status</TooltipContent>
          </Tooltip>
        </div>

        {/* The closest sending limit gets its own line, so it is readable at any width. */}
        {isWorking && limitLabel && (
          <div
            className={cn(
              "flex items-center gap-1.5 border-b border-[var(--chat-border)] px-4 py-1.5 text-[12px]",
              limitLabel.tone === "error"
                ? "bg-error-bg text-error-foreground"
                : limitLabel.tone === "warning"
                  ? "bg-warning-bg text-warning-foreground"
                  : "text-[var(--chat-text-secondary)]",
            )}
            role="status"
          >
            <Gauge className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
            <span className="truncate">Sending limit: {limitLabel.text}</span>
          </div>
        )}

        {isWorking && (
          <>
            {/* Search, which also starts a new chat */}
            <div className="flex items-center gap-2 px-3 pb-2 pt-2">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-[var(--chat-bg-input)] px-3 py-1.5">
                <Search className="size-4 shrink-0 text-[var(--chat-text-tertiary)]" strokeWidth={1.75} />
                <input
                  placeholder="Search chats"
                  aria-label="Search chats"
                  value={chatSearch}
                  onChange={(e) => setChatSearch(e.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-[14px] text-[var(--chat-text-primary)] placeholder:text-[var(--chat-text-tertiary)] focus:outline-none"
                />
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label="New chat"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 rounded-full bg-[var(--chat-bg-input)] text-[var(--chat-text-secondary)] hover:bg-[var(--chat-bg-hover)] hover:text-[var(--chat-text-primary)]"
                    onClick={onOpenNewChat}
                  >
                    <Plus className="size-[18px]" strokeWidth={1.75} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>New chat</TooltipContent>
              </Tooltip>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-1.5 px-3 pb-2" role="group" aria-label="Filter chats">
              {(["all", "unread", "groups"] as const).map((value) => {
                const active = filter === value
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilter(value)}
                    className={cn(
                      "flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "bg-[var(--chat-accent-soft)] font-medium text-[var(--chat-accent)]"
                        : "bg-[var(--chat-bg-input)] text-[var(--chat-text-secondary)] hover:text-[var(--chat-text-primary)]",
                    )}
                  >
                    {value === "all" ? "All" : value === "unread" ? "Unread" : "Groups"}
                    {value === "unread" && unreadTotal > 0 && (
                      <span className="metric flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--chat-unread-bg)] px-1 text-[10px] font-bold text-[var(--chat-unread-text)]">
                        {unreadTotal > 99 ? "99+" : unreadTotal}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        )}

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          {!isWorking ? (
            connectPanel
          ) : loadingChats ? (
            <div className="space-y-3 p-3" aria-hidden>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="size-10 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : failure === "store-disabled" || failure === "database-unreachable" ? (
            <div className="p-2">
              <ErrorState
                compact
                title={failure === "store-disabled" ? STORE_DISABLED_TITLE : DATABASE_UNREACHABLE_TITLE}
                description={failure === "store-disabled" ? STORE_DISABLED_DESCRIPTION : DATABASE_UNREACHABLE_DESCRIPTION}
                onRetry={onRetryChats}
              />
            </div>
          ) : failure === "other" && chats.length === 0 ? (
            <div className="p-2">
              <ErrorState compact title="Could not load chats" onRetry={onRetryChats} />
            </div>
          ) : filteredChats.length === 0 ? (
            <EmptyState
              compact
              icon={<MessageSquarePlus className="size-5" strokeWidth={1.75} />}
              title={emptyCopy.title}
              description={emptyCopy.description}
            />
          ) : (
            <div className="relative px-1.5" style={{ height: virtualizer.getTotalSize() + (loadingMore ? 40 : 0) }}>
              {virtualRows.map((row) => {
                const chat = filteredChats[row.index]
                const active = chat.id === selectedChatId
                const name = chatName(chat, contacts)
                const color = avColor(chat.id, false)
                const unread = chat.unreadCount ?? 0
                const online = presences?.get(chat.id) === "available"
                const tLabel = typingLabel(typingMap?.get(chat.id))
                const lastMessageTime = lastMessageTimeMs(chat.lastMessage)
                return (
                  <button
                    key={chat.id}
                    onClick={() => onSelectChat(chat.id)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "absolute inset-x-1.5 flex items-center gap-3 rounded-xl px-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      active ? "bg-[var(--chat-bg-selected)]" : "hover:bg-[var(--chat-bg-hover)]",
                    )}
                    style={{ top: row.start, height: ROW_HEIGHT }}
                  >
                    <div className="relative shrink-0">
                      <Avatar className="size-10">
                        <AvatarImage src={pictureOf(chat)} />
                        <AvatarFallback className="text-sm" style={{ background: color.bg, color: color.fg }}>
                          {chatInitials(chat, contacts)}
                        </AvatarFallback>
                      </Avatar>
                      {online && (
                        <span className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-[var(--chat-bg-sidebar)] bg-[var(--chat-green)]" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={cn("truncate text-[15px] leading-5 text-[var(--chat-text-primary)]", unread > 0 && "font-semibold")}>
                          {name}
                        </span>
                        {lastMessageTime !== null && (
                          <span
                            className={cn(
                              "metric shrink-0 text-[12px] leading-5",
                              unread > 0 ? "font-semibold text-[var(--chat-accent)]" : "text-[var(--chat-text-secondary)]",
                            )}
                          >
                            {formatChatTime(lastMessageTime)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1 text-[13px] leading-[18px]">
                          {tLabel ? (
                            <span className="truncate font-medium text-[var(--chat-accent)]">{tLabel}</span>
                          ) : (
                            <>
                              {chat.lastMessage?.fromMe && (
                                <CheckCheck className="size-4 shrink-0 text-[var(--chat-text-tertiary)]" strokeWidth={1.75} aria-label="Sent by you" />
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
              {loadingMore && (
                <div className="absolute inset-x-0 flex justify-center py-2" style={{ top: virtualizer.getTotalSize() }}>
                  <Loader2 className="size-4 animate-spin text-[var(--chat-text-tertiary)]" aria-label="Loading more chats" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
