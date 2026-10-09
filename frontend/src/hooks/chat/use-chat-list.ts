import { useCallback, useEffect, useRef, useState } from "react"
import { api, type ChatOverview, type Message } from "@/lib/api"
import { classifyStoreError, type StoreFailure } from "@/lib/chat-errors"

export const CHAT_PAGE_SIZE = 50
const REFRESH_MS = 60_000
const UNKNOWN_CHAT_REFRESH_MS = 3_000

/** The overview row plus the raw store chat some engines attach. */
type OverviewRow = ChatOverview & { _chat?: { unreadCount?: number | null } }

/** Unread count as reported by the server. Baileys uses -1 for "marked unread". */
function serverUnread(chat: OverviewRow): number {
  const raw = chat.unreadCount ?? chat._chat?.unreadCount ?? 0
  if (raw < 0) return 1
  return raw
}

export interface ChatListState {
  chats: ChatOverview[]
  /** First page for this session is loading. */
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  failure: StoreFailure | null
}

/**
 * The conversation list for one session.
 *
 * It loads a page at a time and then patches itself: an incoming message or
 * tick updates that chat's row in place and moves it to the top, instead of
 * re-downloading the whole list. A full refresh happens on session switch,
 * on demand (WebSocket reconnect, after a send from a dialog) and every 60 s
 * as a safety net.
 *
 * Unread counts start from the server's store value and then count incoming
 * messages locally; opening a chat resets its count. Answers that belong to a
 * session the user has already left are dropped.
 */
export function useChatList(session: string, enabled: boolean) {
  const [state, setState] = useState<ChatListState>({
    chats: [],
    loading: !!session && enabled,
    loadingMore: false,
    hasMore: false,
    failure: null,
  })
  // Bumped on every session change; async results from an older generation are ignored.
  const generationRef = useRef(0)
  const chatsRef = useRef<ChatOverview[]>([])
  const localUnreadRef = useRef<Map<string, number>>(new Map())
  const unknownRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const commit = useCallback((next: Partial<ChatListState>) => {
    setState((prev) => {
      const merged = { ...prev, ...next }
      chatsRef.current = merged.chats
      return merged
    })
  }, [])

  /** Apply the local unread overlay to a server page. */
  const withUnread = useCallback((rows: OverviewRow[]): ChatOverview[] => {
    const overlay = localUnreadRef.current
    return rows.map((row) => ({
      ...row,
      unreadCount: overlay.has(row.id) ? overlay.get(row.id) : serverUnread(row),
    }))
  }, [])

  const fetchPage = useCallback(
    async (limit: number, offset: number) => {
      const generation = generationRef.current
      const rows = (await api.getChatsOverview(session, limit, offset)) as OverviewRow[]
      return { generation, rows }
    },
    [session],
  )

  const refresh = useCallback(async () => {
    if (!session || !enabled) return
    const loaded = Math.max(CHAT_PAGE_SIZE, chatsRef.current.length)
    const generation = generationRef.current
    try {
      const { rows } = await fetchPage(loaded, 0)
      if (generation !== generationRef.current) return
      commit({ chats: withUnread(rows), hasMore: rows.length === loaded, failure: null, loading: false })
    } catch (error) {
      if (generation !== generationRef.current) return
      commit({ failure: classifyStoreError(error), loading: false })
    }
  }, [session, enabled, fetchPage, withUnread, commit])

  // Session switch: start over. The reset happens during render (React's
  // "adjust state when an input changes"), the fetch in the effect below.
  const key = `${session}|${enabled}`
  const [stateKey, setStateKey] = useState(key)
  if (stateKey !== key) {
    setStateKey(key)
    setState({ chats: [], loading: !!session && enabled, loadingMore: false, hasMore: false, failure: null })
  }

  useEffect(() => {
    generationRef.current += 1
    localUnreadRef.current = new Map()
    chatsRef.current = []
    if (unknownRefreshTimer.current) clearTimeout(unknownRefreshTimer.current)
    if (!session || !enabled) return
    const generation = generationRef.current
    api
      .getChatsOverview(session, CHAT_PAGE_SIZE, 0)
      .then((rows) => {
        if (generation !== generationRef.current) return
        commit({
          chats: withUnread(rows as OverviewRow[]),
          hasMore: rows.length === CHAT_PAGE_SIZE,
          loading: false,
          failure: null,
        })
      })
      .catch((error) => {
        if (generation !== generationRef.current) return
        commit({ loading: false, failure: classifyStoreError(error) })
      })
    const interval = setInterval(() => void refresh(), REFRESH_MS)
    return () => clearInterval(interval)
    // refresh is intentionally not a dependency: it changes with the list,
    // and the interval only needs the latest one, which it reads at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, enabled])

  const refreshRef = useRef(refresh)
  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  // The flags loadMore checks, current outside a render (a setState updater
  // runs later, at render time, so it cannot gate the request).
  const flagsRef = useRef({ loading: state.loading, loadingMore: state.loadingMore, hasMore: state.hasMore })
  useEffect(() => {
    flagsRef.current = { loading: state.loading, loadingMore: state.loadingMore, hasMore: state.hasMore }
  }, [state.loading, state.loadingMore, state.hasMore])

  const loadMore = useCallback(async () => {
    if (!session || !enabled) return
    const flags = flagsRef.current
    if (flags.loadingMore || !flags.hasMore || flags.loading) return
    flagsRef.current = { ...flags, loadingMore: true }
    commit({ loadingMore: true })
    const offset = chatsRef.current.length
    try {
      const { generation, rows } = await fetchPage(CHAT_PAGE_SIZE, offset)
      if (generation !== generationRef.current) return
      const known = new Set(chatsRef.current.map((c) => c.id))
      const fresh = withUnread(rows).filter((c) => !known.has(c.id))
      commit({
        chats: [...chatsRef.current, ...fresh],
        hasMore: rows.length === CHAT_PAGE_SIZE,
        loadingMore: false,
      })
    } catch {
      commit({ loadingMore: false })
    }
  }, [session, enabled, fetchPage, withUnread, commit])

  /** Patch the list for a live message (`message` / `message.any`). */
  const applyMessage = useCallback(
    (message: Message, openChatId: string | null) => {
      const chatId = message.fromMe ? message.to : message.from
      if (!chatId || chatId === "status@broadcast") return
      const current = chatsRef.current
      const index = current.findIndex((c) => c.id === chatId)
      const existing = index >= 0 ? current[index] : null
      if (existing?.lastMessage && existing.lastMessage.timestamp > message.timestamp) return

      const overlay = localUnreadRef.current
      let unread = existing?.unreadCount ?? 0
      if (!message.fromMe && chatId !== openChatId && existing?.lastMessage?.id !== message.id) {
        unread += 1
        overlay.set(chatId, unread)
      }
      const raw = (message as Message & { _data?: { pushName?: string } })._data
      const row: ChatOverview = {
        ...(existing ?? { id: chatId, name: raw?.pushName || chatId.split("@")[0] }),
        unreadCount: unread,
        lastMessage: {
          id: message.id,
          timestamp: message.timestamp,
          from: message.from,
          fromMe: message.fromMe,
          body: message.body,
        },
      }
      const rest = index >= 0 ? [...current.slice(0, index), ...current.slice(index + 1)] : current
      commit({ chats: [row, ...rest] })

      // A chat the list has never seen: fetch the real row (name, picture) soon.
      if (!existing && !unknownRefreshTimer.current) {
        unknownRefreshTimer.current = setTimeout(() => {
          unknownRefreshTimer.current = null
          void refreshRef.current()
        }, UNKNOWN_CHAT_REFRESH_MS)
      }
    },
    [commit],
  )

  const markRead = useCallback(
    (chatId: string) => {
      localUnreadRef.current.set(chatId, 0)
      const current = chatsRef.current
      if (!current.some((c) => c.id === chatId && (c.unreadCount ?? 0) > 0)) return
      commit({ chats: current.map((c) => (c.id === chatId ? { ...c, unreadCount: 0 } : c)) })
    },
    [commit],
  )

  /** Put a chat the list does not have yet at the top (new-chat dialog). */
  const ensureChat = useCallback(
    (chat: ChatOverview) => {
      if (chatsRef.current.some((c) => c.id === chat.id)) return
      commit({ chats: [chat, ...chatsRef.current] })
    },
    [commit],
  )

  useEffect(
    () => () => {
      if (unknownRefreshTimer.current) clearTimeout(unknownRefreshTimer.current)
    },
    [],
  )

  return { ...state, refresh, loadMore, applyMessage, markRead, ensureChat }
}
