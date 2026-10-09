import { useCallback, useEffect, useRef, useState } from "react"
import { api, ApiError, type Message } from "@/lib/api"
import { classifyStoreError, type StoreFailure } from "@/lib/chat-errors"
import { sendErrorMessage } from "@/components/chat/helpers"

export const MESSAGE_PAGE_SIZE = 50

/** A message the user sent from this page that has not been confirmed. */
export type ThreadMessage = Message & {
  /** Set when the send failed; the bubble stays in the thread with this reason. */
  sendError?: string
  /** What to resend on Retry. */
  pending?: { text: string; replyTo?: string }
}

export interface ChatThreadState {
  /** Newest first, as the API returns them. */
  messages: ThreadMessage[]
  loading: boolean
  loadingOlder: boolean
  hasMore: boolean
  failure: StoreFailure | null
}

/** The fields of a WebSocket message/ack/reaction payload the thread reads. */
export interface ThreadEventPayload {
  id?: string
  ack?: number
  ackName?: string
  from?: string
  to?: string
  fromMe?: boolean
  participant?: string
  timestamp?: number
  reaction?: { messageId?: string; text?: string }
}

const EMPTY: ChatThreadState = { messages: [], loading: false, loadingOlder: false, hasMore: false, failure: null }

/** "Send blocked by the sending policy: Quiet hours ... Retry after 300 seconds" → short reason. */
function failureReason(error: unknown): string {
  if (error instanceof ApiError && error.status === 429) {
    const text = error.message.replace(/^Send blocked by the sending policy:\s*/i, "").replace(/\.\s*Retry after.*$/i, "")
    const wait = error.retryAfterSeconds
    return `Not sent: ${text}${wait ? `, retry in ${wait < 120 ? `${wait} s` : `${Math.ceil(wait / 60)} min`}` : ""}`
  }
  return `Not sent: ${sendErrorMessage(error, "the server refused the message")}`
}

/**
 * One chat's messages.
 *
 * Messages are applied by id: a live message, tick or reaction changes only
 * the message it belongs to, so React re-renders that bubble and not the
 * thread. Older history loads a page at a time as the user scrolls up. A send
 * appears immediately; if it fails it stays in the thread, marked with the
 * reason and a Retry, instead of disappearing behind a toast.
 */
export function useChatThread(session: string, chatId: string | null, currentUserJid: string) {
  const [state, setState] = useState<ChatThreadState>(() => ({ ...EMPTY, loading: !!session && !!chatId }))
  const generationRef = useRef(0)
  const messagesRef = useRef<ThreadMessage[]>([])

  const update = useCallback((fn: (prev: ChatThreadState) => ChatThreadState) => {
    setState((prev) => {
      const next = fn(prev)
      messagesRef.current = next.messages
      return next
    })
  }, [])

  const loadLatest = useCallback(async () => {
    if (!session || !chatId) return
    const generation = generationRef.current
    const listedBefore = new Set(messagesRef.current.map((m) => m.id))
    try {
      const page = await api.getMessages(session, chatId, MESSAGE_PAGE_SIZE, 0)
      if (generation !== generationRef.current) return
      update((prev) => {
        // Keep what the page does not have but the user must still see:
        // unconfirmed or failed sends from here, and anything that arrived
        // over the socket while the request was in flight.
        const inPage = new Set(page.map((m) => m.id))
        const keep = prev.messages.filter((m) => !inPage.has(m.id) && (m.pending || !listedBefore.has(m.id)))
        return {
          ...prev,
          messages: [...keep, ...page],
          loading: false,
          hasMore: page.length === MESSAGE_PAGE_SIZE,
          failure: null,
        }
      })
      api.sendSeen(session, chatId).catch(() => {})
    } catch (error) {
      if (generation !== generationRef.current) return
      update((prev) => ({ ...prev, loading: false, failure: classifyStoreError(error) }))
    }
  }, [session, chatId, update])

  // Chat switch: reset during render, fetch in the effect.
  const key = `${session}|${chatId ?? ""}`
  const [stateKey, setStateKey] = useState(key)
  if (stateKey !== key) {
    setStateKey(key)
    setState({ ...EMPTY, loading: !!session && !!chatId })
  }

  useEffect(() => {
    generationRef.current += 1
    messagesRef.current = []
    if (!session || !chatId) return
    void loadLatest()
    // loadLatest is keyed on the same session/chat; listing it would refetch twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, chatId])

  // The flags loadOlder checks, current outside a render.
  const flagsRef = useRef({ loading: state.loading, loadingOlder: state.loadingOlder, hasMore: state.hasMore })
  useEffect(() => {
    flagsRef.current = { loading: state.loading, loadingOlder: state.loadingOlder, hasMore: state.hasMore }
  }, [state.loading, state.loadingOlder, state.hasMore])

  const loadOlder = useCallback(async () => {
    if (!session || !chatId) return
    const flags = flagsRef.current
    if (flags.loadingOlder || !flags.hasMore || flags.loading) return
    flagsRef.current = { ...flags, loadingOlder: true }
    update((prev) => ({ ...prev, loadingOlder: true }))
    const generation = generationRef.current
    const offset = messagesRef.current.filter((m) => !m.pending).length
    try {
      const page = await api.getMessages(session, chatId, MESSAGE_PAGE_SIZE, offset)
      if (generation !== generationRef.current) return
      update((prev) => {
        const known = new Set(prev.messages.map((m) => m.id))
        return {
          ...prev,
          messages: [...prev.messages, ...page.filter((m) => !known.has(m.id))],
          loadingOlder: false,
          hasMore: page.length === MESSAGE_PAGE_SIZE,
        }
      })
    } catch {
      if (generation !== generationRef.current) return
      update((prev) => ({ ...prev, loadingOlder: false }))
    }
  }, [session, chatId, update])

  /** Apply a WebSocket event that belongs to this chat. */
  const applyEvent = useCallback(
    (event: string, payload: ThreadEventPayload) => {
      if (event === "message" || event === "message.any") {
        update((prev) =>
          prev.messages.some((m) => m.id === payload.id)
            ? prev
            : { ...prev, messages: [payload as unknown as ThreadMessage, ...prev.messages] },
        )
      } else if (event === "message.ack") {
        update((prev) => {
          const index = prev.messages.findIndex((m) => m.id === payload.id)
          if (index === -1 || prev.messages[index].ack === payload.ack) return prev
          const messages = prev.messages.slice()
          messages[index] = { ...messages[index], ack: payload.ack ?? messages[index].ack, ackName: payload.ackName ?? messages[index].ackName }
          return { ...prev, messages }
        })
      } else if (event === "message.reaction") {
        const messageId = payload.reaction?.messageId
        const text = payload.reaction?.text
        if (!messageId) return
        const reactor = payload.participant || payload.from
        update((prev) => {
          const index = prev.messages.findIndex((m) => m.id === messageId)
          if (index === -1) return prev
          const target = prev.messages[index]
          const kept = (target.reactions || []).filter((r) => r.key?.remoteJid !== reactor)
          const reactions = text
            ? [...kept, { text, key: { fromMe: payload.fromMe, remoteJid: reactor }, senderTimestampMs: (payload.timestamp || 0) * 1000 }]
            : kept
          const messages = prev.messages.slice()
          messages[index] = { ...target, reactions }
          return { ...prev, messages }
        })
      }
    },
    [update],
  )

  const sendText = useCallback(
    async (text: string, replyTo?: string, retryOf?: string) => {
      if (!session || !chatId) return
      const generation = generationRef.current
      const tempId = retryOf ?? `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`
      const optimistic: ThreadMessage = {
        id: tempId,
        timestamp: Math.floor(Date.now() / 1000),
        from: currentUserJid,
        fromMe: true,
        to: chatId,
        body: text,
        hasMedia: false,
        ack: 0,
        ackName: "PENDING",
        replyTo: replyTo || null,
        pending: { text, replyTo },
      }
      update((prev) => ({
        ...prev,
        messages: retryOf
          ? prev.messages.map((m) => (m.id === retryOf ? optimistic : m))
          : [optimistic, ...prev.messages],
      }))
      try {
        const sent = await api.sendText(session, chatId, text, replyTo)
        if (generation !== generationRef.current) return
        const realId = (sent as { id?: string } | undefined)?.id
        update((prev) => ({
          ...prev,
          messages: prev.messages
            // The socket echo may already have added the real message.
            .filter((m) => !(realId && m.id === realId && m.id !== tempId))
            .map((m) => {
              if (m.id !== tempId) return m
              const { pending: _pending, sendError: _error, ...rest } = m
              void _pending
              void _error
              return { ...rest, ...(sent as object), id: realId || tempId, ack: 1, ackName: "SERVER" }
            }),
        }))
      } catch (error) {
        if (generation !== generationRef.current) return
        const reason = failureReason(error)
        update((prev) => ({
          ...prev,
          messages: prev.messages.map((m) => (m.id === tempId ? { ...m, ack: -1, ackName: "ERROR", sendError: reason } : m)),
        }))
      }
    },
    [session, chatId, currentUserJid, update],
  )

  const retry = useCallback(
    (messageId: string) => {
      const failed = messagesRef.current.find((m) => m.id === messageId && m.pending)
      if (failed?.pending) void sendText(failed.pending.text, failed.pending.replyTo, messageId)
    },
    [sendText],
  )

  /** Optimistic local edit of one message; returns an undo. */
  const patchMessage = useCallback(
    (messageId: string, fn: (m: ThreadMessage) => ThreadMessage) => {
      const before = messagesRef.current.find((m) => m.id === messageId)
      update((prev) => ({ ...prev, messages: prev.messages.map((m) => (m.id === messageId ? fn(m) : m)) }))
      return () => {
        if (!before) return
        update((prev) => ({ ...prev, messages: prev.messages.map((m) => (m.id === messageId ? before : m)) }))
      }
    },
    [update],
  )

  const discard = useCallback(
    (messageId: string) => update((prev) => ({ ...prev, messages: prev.messages.filter((m) => m.id !== messageId) })),
    [update],
  )

  return { ...state, reload: loadLatest, loadOlder, applyEvent, sendText, retry, patchMessage, discard }
}
