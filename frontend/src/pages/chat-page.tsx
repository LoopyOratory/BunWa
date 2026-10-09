import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CircleDot, MessageSquare, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ChatProvider, ChatMessages } from "@/components/ui/chat"
import type { ChatUser, ChatMessageData, TypingUser } from "@/components/ui/chat"
import { EmptyState, ErrorState, Skeleton } from "@/components/primitives"
import { api, type ChatOverview, type Contact, type Message, type Session } from "@/lib/api"
import { useWebSocket } from "@/lib/use-websocket"
import {
  DATABASE_UNREACHABLE_DESCRIPTION,
  DATABASE_UNREACHABLE_TITLE,
  STORE_DISABLED_DESCRIPTION,
  STORE_DISABLED_TITLE,
  isDatabaseUnreachableError,
} from "@/lib/chat-errors"
import { ChatConversations } from "@/components/chat/chat-conversations"
import { ChatHeader } from "@/components/chat/chat-header"
import { ChatComposerWrapper } from "@/components/chat/chat-composer-wrapper"
import { TemplatePicker } from "@/components/chat/template-picker"
import { NewChatDialog, SendMediaDialog, StatusDialog } from "@/components/chat/send-dialogs"
import { SessionConnectPanel } from "@/components/chat/session-connect-panel"
import { chatName, resolveUserJid, showSendError } from "@/components/chat/helpers"
import { useChatList } from "@/hooks/chat/use-chat-list"
import { useChatThread, type ThreadEventPayload } from "@/hooks/chat/use-chat-thread"
import { useAvatars } from "@/hooks/chat/use-avatars"
import { usePresence } from "@/hooks/chat/use-presence"
import { useMappedMessages } from "@/hooks/chat/use-mapped-messages"
import { useSendingLimit } from "@/hooks/chat/use-sending-limit"

/** The fields of a chat-related WebSocket payload this page reads. */
type ChatEventPayload = ThreadEventPayload &
  Partial<Message> & {
    status?: Session["status"]
    presences?: Record<string, { lastKnownPresence?: string }>
  }

type MediaType = "image" | "file" | "voice" | "video" | "location" | "poll" | "buttons"

const SIDEBAR_KEY = "bunwa.chat.sidebar"
const EVENTS = "message,message.any,message.ack,message.reaction,presence.update,session.status"

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "collapsed"
  } catch {
    return false
  }
}

function readStars(key: string | null): Set<string> {
  if (!key) return new Set()
  try {
    return new Set(JSON.parse(localStorage.getItem(key) || "[]"))
  } catch {
    return new Set()
  }
}

interface ChatPageProps {
  initialSession?: string | null
}

/**
 * The chat page: a thin layout over the chat hooks. The list, the open
 * thread, pictures and presence each live in their own hook; this component
 * routes WebSocket events to them and wires the actions.
 */
export function ChatPage({ initialSession }: ChatPageProps) {
  /* ── Sessions ── */
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionsError, setSessionsError] = useState<"database" | "other" | null>(null)
  const [selectedSession, setSelectedSession] = useState("")

  const loadSessions = useCallback(async () => {
    try {
      setSessions(await api.getSessions())
      setSessionsError(null)
    } catch (error) {
      setSessionsError(isDatabaseUnreachableError(error) ? "database" : "other")
    }
  }, [])
  useEffect(() => {
    const first = setTimeout(() => void loadSessions(), 0)
    const interval = setInterval(() => void loadSessions(), 30_000)
    return () => {
      clearTimeout(first)
      clearInterval(interval)
    }
  }, [loadSessions])

  // Pick a session as soon as the list arrives (during render, not in an effect).
  if (!selectedSession && sessions.length > 0) {
    setSelectedSession(initialSession && sessions.some((s) => s.name === initialSession) ? initialSession : sessions[0].name)
  }

  const currentSession = sessions.find((s) => s.name === selectedSession)
  const isWorking = currentSession?.status === "WORKING"
  const currentUserJid = resolveUserJid(currentSession || {})

  /* ── Contacts (names for rows and senders) ── */
  const [contactsState, setContactsState] = useState<{ session: string; map: Map<string, Contact>; error: boolean }>({
    session: "",
    map: new Map(),
    error: false,
  })
  const contacts = useMemo(
    () => (contactsState.session === selectedSession ? contactsState.map : new Map<string, Contact>()),
    [contactsState, selectedSession],
  )
  const contactsError = contactsState.session === selectedSession && contactsState.error
  useEffect(() => {
    if (!selectedSession || !isWorking) return
    let cancelled = false
    api
      .getContacts(selectedSession, 500, 0)
      .then((list) => {
        if (!cancelled) setContactsState({ session: selectedSession, map: new Map(list.map((c) => [c.id, c])), error: false })
      })
      .catch(() => {
        if (!cancelled) setContactsState({ session: selectedSession, map: new Map(), error: true })
      })
    return () => {
      cancelled = true
    }
  }, [selectedSession, isWorking])

  /* ── Open chat ── */
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
  // A chat opened from the new-chat dialog may not be in the list yet.
  const [fallbackChat, setFallbackChat] = useState<ChatOverview | null>(null)
  // Search, filters and the reply/edit draft belong to one chat.
  const [search, setSearch] = useState<string | null>(null)
  const [starredOnly, setStarredOnly] = useState(false)
  const [replyingTo, setReplyingTo] = useState<ChatMessageData | null>(null)
  const [editingMessage, setEditingMessage] = useState<ChatMessageData | null>(null)

  // Switching session closes the chat; switching chat clears its search and
  // draft. Both adjust state during render instead of in an effect.
  const [shownSession, setShownSession] = useState(selectedSession)
  if (shownSession !== selectedSession) {
    setShownSession(selectedSession)
    setSelectedChatId(null)
    setFallbackChat(null)
  }
  const [shownChat, setShownChat] = useState(selectedChatId)
  if (shownChat !== selectedChatId) {
    setShownChat(selectedChatId)
    setSearch(null)
    setStarredOnly(false)
    setReplyingTo(null)
    setEditingMessage(null)
  }

  const list = useChatList(selectedSession, isWorking)
  const avatars = useAvatars(selectedSession)
  const thread = useChatThread(selectedSession, selectedChatId, currentUserJid)
  const presence = usePresence(selectedSession, selectedChatId, isWorking)
  const limit = useSendingLimit(selectedSession, isWorking)

  const selectedChat =
    (selectedChatId && list.chats.find((c) => c.id === selectedChatId)) ||
    (fallbackChat && fallbackChat.id === selectedChatId ? fallbackChat : null)

  useEffect(() => {
    if (selectedChatId) avatars.request([selectedChatId])
    if (currentUserJid) avatars.request([currentUserJid])
  }, [selectedChatId, currentUserJid, avatars])

  /* ── Stars: per chat, persisted locally, mirrored to /api/star ── */
  const starsKey = selectedSession && selectedChatId ? `bunwa.stars.${selectedSession}.${selectedChatId}` : null
  const [starsState, setStarsState] = useState<{ key: string | null; stars: Set<string> }>({ key: null, stars: new Set() })
  const starred = starsState.key === starsKey ? starsState.stars : readStars(starsKey)
  const setStarred = useCallback(
    (next: Set<string>) => {
      setStarsState({ key: starsKey, stars: next })
      if (!starsKey) return
      try {
        localStorage.setItem(starsKey, JSON.stringify([...next]))
      } catch {
        /* private mode */
      }
    },
    [starsKey],
  )

  /* ── In-chat search and starred filter ── */
  const mapped = useMappedMessages(thread.messages, contacts, currentUserJid, starred)
  const query = search?.trim().toLowerCase() ?? ""
  const filtering = starredOnly || query.length > 0
  const visibleMessages = useMemo(
    () =>
      filtering
        ? mapped.filter((m) => (!starredOnly || m.isStarred) && (!query || (m.text ?? "").toLowerCase().includes(query)))
        : mapped,
    [mapped, filtering, starredOnly, query],
  )

  /* ── Dialogs ── */
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [media, setMedia] = useState<{ open: boolean; type: MediaType }>({ open: false, type: "image" })
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? "collapsed" : "expanded")
      } catch {
        /* private mode */
      }
      return next
    })
  }, [])

  /* ── Live events ── */
  const selectedChatIdRef = useRef(selectedChatId)
  const selectedSessionRef = useRef(selectedSession)
  useEffect(() => {
    selectedChatIdRef.current = selectedChatId
    selectedSessionRef.current = selectedSession
  }, [selectedChatId, selectedSession])

  const onEvent = useCallback(
    (data: { event?: string; session?: string; payload?: ChatEventPayload }) => {
      const { event, session, payload } = data ?? {}
      if (!event || !payload) return
      if (session && selectedSessionRef.current && session !== selectedSessionRef.current) return
      const openChatId = selectedChatIdRef.current

      if (event === "session.status") {
        setSessions((prev) => prev.map((s) => (s.name === session ? { ...s, status: payload.status ?? s.status } : s)))
        return
      }
      if (event === "presence.update") {
        if (payload.id) presence.apply(payload.id, payload.presences)
        return
      }
      const belongs = !!openChatId && (payload.from === openChatId || payload.to === openChatId)
      if (event === "message" || event === "message.any") {
        list.applyMessage(payload as unknown as Message, openChatId)
        if (belongs) {
          thread.applyEvent(event, payload)
          if (!payload.fromMe) api.sendSeen(selectedSessionRef.current, openChatId!).catch(() => {})
        }
      } else if (belongs && (event === "message.ack" || event === "message.reaction")) {
        thread.applyEvent(event, payload)
      }
    },
    [list, thread, presence],
  )
  const { connected } = useWebSocket({ session: selectedSession || "*", events: EVENTS, onMessage: onEvent })

  // After a reconnect (not the first connection), catch up on what the socket missed.
  const connectedBefore = useRef(false)
  useEffect(() => {
    if (!connected) return
    if (connectedBefore.current) {
      void list.refresh()
      void thread.reload()
    }
    connectedBefore.current = true
    // Only the connection flip matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected])

  /* ── Actions (stable identities, so the chat context does not churn) ── */
  const actions = {
    selectChat(chatId: string) {
      setSelectedChatId(chatId)
      list.markRead(chatId)
      if (selectedSession) api.readChatMessages(selectedSession, chatId).catch(() => {})
    },
    openNewChat(chatId: string) {
      const chat: ChatOverview = { id: chatId, name: chatId.split("@")[0] }
      setFallbackChat(chat)
      list.ensureChat(chat)
      setSelectedChatId(chatId)
    },
    async send(text: string) {
      if (!selectedSession || !selectedChatId) return
      if (editingMessage) {
        const id = editingMessage.id
        setEditingMessage(null)
        const undo = thread.patchMessage(id, (m) => ({ ...m, body: text }))
        try {
          await api.editMessage(selectedSession, selectedChatId, id, text)
        } catch {
          undo()
          toast.error("Could not edit the message")
        }
        return
      }
      const replyTo = replyingTo?.id
      setReplyingTo(null)
      await thread.sendText(text, replyTo)
      limit.refresh()
    },
    async voice(base64: string, mimetype: string) {
      if (!selectedSession || !selectedChatId) return
      try {
        await api.sendVoice(selectedSession, selectedChatId, { mimetype, filename: "voice.webm", data: base64 })
        void thread.reload()
        limit.refresh()
      } catch (e) {
        showSendError(e, "Could not send the voice note")
      }
    },
    async react(messageId: string, emoji: string) {
      if (!selectedSession || !selectedChatId) return
      const undo = thread.patchMessage(messageId, (m) =>
        m.reactions?.some((r) => r.text === emoji)
          ? m
          : { ...m, reactions: [...(m.reactions || []), { text: emoji, key: { fromMe: true }, senderTimestampMs: Date.now() }] },
      )
      try {
        await api.setReaction(selectedSession, selectedChatId, messageId, emoji)
      } catch {
        undo()
        toast.error("Could not add the reaction")
      }
    },
    async unreact(messageId: string, emoji: string) {
      if (!selectedSession || !selectedChatId) return
      const undo = thread.patchMessage(messageId, (m) => ({ ...m, reactions: m.reactions?.filter((r) => r.text !== emoji) }))
      try {
        await api.setReaction(selectedSession, selectedChatId, messageId, "")
      } catch {
        undo()
        toast.error("Could not remove the reaction")
      }
    },
    async remove(messageId: string) {
      if (!selectedSession || !selectedChatId) return
      const failed = thread.messages.find((m) => m.id === messageId && m.sendError)
      if (failed) {
        thread.discard(messageId)
        return
      }
      try {
        await api.deleteMessage(selectedSession, selectedChatId, messageId)
        void thread.reload()
      } catch {
        toast.error("Could not delete the message")
      }
    },
    async pin(messageId: string) {
      if (!selectedSession || !selectedChatId) return
      try {
        await api.pinMessage(selectedSession, selectedChatId, messageId)
        toast.success("Pinned")
      } catch {
        toast.error("Could not pin the message")
      }
    },
    async star(messageId: string) {
      if (!selectedSession || !selectedChatId) return
      const wasStarred = starred.has(messageId)
      const next = new Set(starred)
      if (wasStarred) next.delete(messageId)
      else next.add(messageId)
      setStarred(next)
      try {
        await api.setStar(selectedSession, selectedChatId, messageId, !wasStarred)
      } catch {
        setStarred(starred)
        toast.error("Could not update the star")
      }
    },
    reply(message: ChatMessageData) {
      setEditingMessage(null)
      setReplyingTo(message)
    },
    edit(message: ChatMessageData) {
      setReplyingTo(null)
      setEditingMessage(message)
    },
    retry(messageId: string) {
      thread.retry(messageId)
    },
    typing(isTyping: boolean) {
      if (!selectedSession || !selectedChatId || !isWorking) return
      const call = isTyping ? api.startTyping : api.stopTyping
      call(selectedSession, selectedChatId).catch(() => {})
    },
    async startSession(name: string) {
      try {
        await api.startSession(name)
        toast.success(`Starting ${name}`)
        await loadSessions()
      } catch {
        toast.error(`Could not start ${name}`)
      }
    },
    async restartSession(name: string) {
      try {
        await api.restartSession(name)
        toast.success(`Restarting ${name}`)
        await loadSessions()
      } catch {
        toast.error(`Could not restart ${name}`)
      }
    },
    async stopSession(name: string) {
      try {
        await api.stopSession(name)
        toast.success(`Stopped ${name}`)
        await loadSessions()
      } catch {
        toast.error(`Could not stop ${name}`)
      }
    },
  }
  const actionsRef = useRef(actions)
  useEffect(() => {
    actionsRef.current = actions
  })
  // One set of stable functions that always call the latest action.
  const stable = useMemo(
    () => ({
      onReactionAdd: (id: string, emoji: string) => void actionsRef.current.react(id, emoji),
      onReactionRemove: (id: string, emoji: string) => void actionsRef.current.unreact(id, emoji),
      onReply: (m: ChatMessageData) => actionsRef.current.reply(m),
      onEdit: (m: ChatMessageData) => actionsRef.current.edit(m),
      onDelete: (id: string) => void actionsRef.current.remove(id),
      onPin: (id: string) => void actionsRef.current.pin(id),
      onStar: (id: string) => void actionsRef.current.star(id),
      onRetry: (id: string) => actionsRef.current.retry(id),
    }),
    [],
  )

  const chatUser: ChatUser = useMemo(
    () => ({
      id: currentUserJid,
      name: currentSession?.me?.pushName || selectedSession,
      avatar: avatars.get(currentUserJid),
      status: isWorking ? "online" : "offline",
    }),
    [currentUserJid, currentSession?.me?.pushName, selectedSession, avatars, isWorking],
  )

  const typingUsers: TypingUser[] = useMemo(() => {
    if (!selectedChat || !presence.typing.get(selectedChat.id)) return []
    return [{ id: selectedChat.id, name: chatName(selectedChat, contacts) }]
  }, [presence.typing, selectedChat, contacts])

  /* ── Layout pieces ── */
  const conversations = (
    <ChatConversations
      sessions={sessions}
      selectedSession={selectedSession}
      onSessionChange={setSelectedSession}
      onStartSession={(name) => void actions.startSession(name)}
      onStopSession={(name) => void actions.stopSession(name)}
      isWorking={isWorking}
      chats={list.chats}
      contacts={contacts}
      selectedChatId={selectedChatId}
      onSelectChat={actions.selectChat}
      loadingChats={list.loading}
      hasMore={list.hasMore}
      loadingMore={list.loadingMore}
      onLoadMore={list.loadMore}
      avatars={avatars}
      onOpenNewChat={() => setNewChatOpen(true)}
      onOpenStatus={() => setStatusOpen(true)}
      failure={list.failure}
      onRetryChats={() => void list.refresh()}
      connectPanel={
        <SessionConnectPanel
          session={currentSession}
          onStart={() => void actions.startSession(selectedSession)}
          onRestart={() => void actions.restartSession(selectedSession)}
        />
      }
      limitLabel={limit.label}
      collapsed={collapsed}
      onToggleCollapse={toggleCollapsed}
      presences={presence.presences}
      typingMap={presence.typing}
    />
  )
  const dialogs = (
    <>
      <NewChatDialog open={newChatOpen} onOpenChange={setNewChatOpen} session={selectedSession} onOpenChat={actions.openNewChat} />
      <StatusDialog open={statusOpen} onOpenChange={setStatusOpen} session={selectedSession} onSent={() => void list.refresh()} />
    </>
  )

  /* ── No session ── */
  if (!selectedSession) {
    return (
      <ChatProvider currentUser={chatUser} theme="whatsapp" className="h-dvh" messageGroupingInterval={120}>
        <div className="flex h-full flex-col overflow-hidden bg-[var(--chat-bg-main)]">
          <div className="p-3 md:hidden">
            <SidebarTrigger />
          </div>
          <div className="flex flex-1 items-center justify-center px-4">
            {sessionsError ? (
              <div className="w-full max-w-md">
                <ErrorState
                  title={sessionsError === "database" ? DATABASE_UNREACHABLE_TITLE : "Could not load sessions"}
                  description={sessionsError === "database" ? DATABASE_UNREACHABLE_DESCRIPTION : "The sessions API did not respond."}
                  onRetry={() => void loadSessions()}
                />
              </div>
            ) : (
              <EmptyState
                icon={<CircleDot className="size-6" strokeWidth={1.75} />}
                title="Create a session first"
                description="Chat opens a session's conversations. Create and start one from the dashboard."
              />
            )}
          </div>
        </div>
      </ChatProvider>
    )
  }

  /* ── No chat open ── */
  if (!selectedChat) {
    return (
      <ChatProvider currentUser={chatUser} theme="whatsapp" className="h-dvh" messageGroupingInterval={120} {...stable}>
        <div className="flex h-full overflow-hidden bg-[var(--chat-bg-main)]">
          <div
            className={`min-h-0 min-w-0 w-full shrink-0 ${
              collapsed ? "md:w-[var(--chat-sidebar-rail-width)]" : "md:w-[var(--chat-sidebar-width)]"
            }`}
          >
            {conversations}
          </div>
          <div className="chat-wallpaper hidden flex-1 items-center justify-center px-4 md:flex">
            <EmptyState
              icon={<MessageSquare className="size-6" strokeWidth={1.75} />}
              title={isWorking ? "Select a conversation" : "No conversations to show"}
              description={
                isWorking
                  ? "Choose a chat from the list, or start a new one with the + button."
                  : "Connect the session from the panel on the left to see its conversations."
              }
            />
          </div>
          {dialogs}
        </div>
      </ChatProvider>
    )
  }

  /* ── Open chat ── */
  return (
    <ChatProvider
      currentUser={chatUser}
      theme="whatsapp"
      className="h-dvh"
      messageGroupingInterval={120}
      showSenders={selectedChat.id.endsWith("@g.us")}
      {...stable}
    >
      <div className="chat-shell h-full overflow-hidden bg-[var(--chat-bg-main)]" data-sidebar={collapsed ? "rail" : "expanded"}>
        <div className="hidden min-h-0 min-w-0 md:col-start-1 md:row-start-1 md:row-span-2 md:flex">{conversations}</div>

        <div className="col-start-2 row-start-1 min-w-0">
          <ChatHeader
            chat={selectedChat}
            contacts={contacts}
            picture={avatars.get(selectedChat.id)}
            presence={presence.presences.get(selectedChat.id)}
            typing={presence.typing.has(selectedChat.id)}
            onBack={() => setSelectedChatId(null)}
            onArchive={() =>
              api
                .archiveChat(selectedSession, selectedChat.id)
                .then(() => {
                  toast.success("Archived")
                  setSelectedChatId(null)
                  void list.refresh()
                })
                .catch(() => toast.error("Could not archive the chat"))
            }
            onMarkUnread={() =>
              api
                .unreadChat(selectedSession, selectedChat.id)
                .then(() => toast.success("Marked unread"))
                .catch(() => toast.error("Could not mark the chat unread"))
            }
            search={search}
            onSearchChange={setSearch}
            starredOnly={starredOnly}
            onToggleStarredOnly={() => setStarredOnly((v) => !v)}
          />
        </div>

        <div className="col-start-2 row-start-2 flex min-h-0 min-w-0 flex-col overflow-hidden">
          {contactsError && !thread.failure && (
            <div role="alert" className="mx-3 mt-3 flex items-center gap-2 rounded-md border border-error-border bg-error-bg px-3 py-2 text-xs text-error-foreground">
              <TriangleAlert className="size-3.5 shrink-0" strokeWidth={1.75} />
              Contact names could not be loaded, so some chats show numbers instead.
            </div>
          )}
          {filtering && (
            <p className="border-b border-[var(--chat-border)] bg-[var(--chat-bg-header)] px-4 py-1.5 text-xs text-[var(--chat-text-secondary)]" aria-live="polite">
              {visibleMessages.length} {visibleMessages.length === 1 ? "message" : "messages"}
              {starredOnly ? " starred" : ""}
              {query ? ` matching “${search?.trim()}”` : ""} in the loaded history
            </p>
          )}
          {thread.failure === "database-unreachable" || thread.failure === "store-disabled" ? (
            <div className="min-h-0 overflow-y-auto p-4">
              <ErrorState
                title={thread.failure === "store-disabled" ? STORE_DISABLED_TITLE : DATABASE_UNREACHABLE_TITLE}
                description={thread.failure === "store-disabled" ? STORE_DISABLED_DESCRIPTION : DATABASE_UNREACHABLE_DESCRIPTION}
                onRetry={() => {
                  void thread.reload()
                  void list.refresh()
                }}
              />
            </div>
          ) : thread.failure === "other" && thread.messages.length === 0 ? (
            <div className="min-h-0 overflow-y-auto p-4">
              <ErrorState title="Could not load messages" onRetry={() => void thread.reload()} />
            </div>
          ) : thread.loading && thread.messages.length === 0 ? (
            <div className="flex flex-col gap-4 p-4" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={i % 2 === 0 ? "flex justify-start" : "flex justify-end"}>
                  <Skeleton className={`h-16 rounded-2xl ${i % 2 === 0 ? "w-3/5" : "w-2/5"}`} />
                </div>
              ))}
            </div>
          ) : (
            <ChatMessages
              messages={visibleMessages}
              typingUsers={typingUsers}
              hasMore={thread.hasMore && !filtering}
              loadingMore={thread.loadingOlder}
              onLoadMore={thread.loadOlder}
            />
          )}
        </div>

        {/* The composer band runs across the conversations column too. */}
        <div aria-hidden className="hidden border-r border-t border-[var(--chat-border)] bg-[var(--chat-bg-composer)] md:col-start-1 md:row-start-3 md:block" />

        <div className="relative col-start-2 row-start-3 min-w-0 border-t border-[var(--chat-border)] bg-[var(--chat-bg-composer)]">
          <SendMediaDialog
            open={media.open}
            onOpenChange={(open) => setMedia((prev) => ({ ...prev, open }))}
            type={media.type}
            session={selectedSession}
            chatId={selectedChat.id}
            onSent={() => {
              void thread.reload()
              limit.refresh()
            }}
          />
          <ChatComposerWrapper
            onSend={(text) => void actions.send(text)}
            onTyping={actions.typing}
            placeholder={editingMessage ? "Edit message" : "Type a message"}
            disabled={!isWorking}
            replyingTo={editingMessage || replyingTo}
            onCancelReply={() => {
              setReplyingTo(null)
              setEditingMessage(null)
            }}
            onOpenMediaDialog={(type) => setMedia({ open: true, type })}
            onVoiceRecorded={(base64, mimetype) => void actions.voice(base64, mimetype)}
            onOpenTemplates={() => setTemplatesOpen(true)}
          />
        </div>

        {dialogs}
        <TemplatePicker
          session={selectedSession}
          chatId={selectedChat.id}
          onSent={() => {
            void thread.reload()
            limit.refresh()
          }}
          open={templatesOpen}
          onOpenChange={setTemplatesOpen}
        />
      </div>
    </ChatProvider>
  )
}
