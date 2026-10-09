import { useCallback, useEffect, useRef, useState } from "react"
import { api } from "@/lib/api"

/** Ordering for picking the strongest presence among several participants. */
const PRESENCE_RANK: Record<string, number> = { recording: 4, composing: 3, available: 2, paused: 1, unavailable: 0 }
/** Engines do not always send "paused" after composing; clear typing after this. */
const TYPING_TIMEOUT_MS = 12_000

type PresenceEntries = Record<string, { lastKnownPresence?: string }> | undefined

function strongest(entries: PresenceEntries): string | null {
  let state: string | null = null
  for (const p of Object.values(entries || {})) {
    const s = p?.lastKnownPresence
    if (!s) continue
    if (!state || (PRESENCE_RANK[s] ?? 0) > (PRESENCE_RANK[state] ?? 0)) state = s
  }
  return state
}

/**
 * Online dots and "typing…" for one session: seeded from the presence list
 * when the session is working, updated from `presence.update` events, and
 * subscribed for the open chat.
 */
export function usePresence(session: string, openChatId: string | null, working: boolean) {
  const [presences, setPresences] = useState<Map<string, string>>(new Map())
  const [typing, setTyping] = useState<Map<string, string>>(new Map())
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // A different session (or one that stopped working) starts with no dots.
  const key = `${session}|${working}`
  const [stateKey, setStateKey] = useState(key)
  if (stateKey !== key) {
    setStateKey(key)
    setPresences(new Map())
    setTyping(new Map())
  }

  const setTypingFor = useCallback((chatId: string, state: string | null) => {
    const timers = timersRef.current
    const existing = timers.get(chatId)
    if (existing) {
      clearTimeout(existing)
      timers.delete(chatId)
    }
    const clear = () =>
      setTyping((prev) => {
        if (!prev.has(chatId)) return prev
        const next = new Map(prev)
        next.delete(chatId)
        return next
      })
    if (!state) {
      clear()
      return
    }
    setTyping((prev) => (prev.get(chatId) === state ? prev : new Map(prev).set(chatId, state)))
    timers.set(
      chatId,
      setTimeout(() => {
        timers.delete(chatId)
        clear()
      }, TYPING_TIMEOUT_MS),
    )
  }, [])

  const apply = useCallback(
    (chatId: string, entries: PresenceEntries) => {
      const state = strongest(entries)
      if (!state) return
      // Presence events are chatty; keep the map when nothing changed.
      setPresences((prev) => (prev.get(chatId) === state ? prev : new Map(prev).set(chatId, state)))
      setTypingFor(chatId, state === "composing" || state === "recording" ? state : null)
    },
    [setTypingFor],
  )

  // Seed the list dots when the session becomes working.
  useEffect(() => {
    if (!session || !working) return
    let cancelled = false
    api
      .getPresences(session)
      .then((list) => {
        if (cancelled || !Array.isArray(list)) return
        const next = new Map<string, string>()
        for (const item of list as Array<{ id?: string; presences?: PresenceEntries }>) {
          const state = item?.id ? strongest(item.presences) : null
          if (item?.id && state) next.set(item.id, state)
        }
        if (next.size) setPresences((prev) => new Map([...prev, ...next]))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [session, working])

  // Subscribe to the open chat and read its current state.
  useEffect(() => {
    if (!session || !openChatId || !working) return
    api.subscribePresence(session, openChatId).catch(() => {})
    api
      .getPresence(session, openChatId)
      .then((res) => apply(openChatId, (res as unknown as { presences?: PresenceEntries })?.presences))
      .catch(() => {})
  }, [session, openChatId, working, apply])

  useEffect(
    () => () => {
      for (const timer of timersRef.current.values()) clearTimeout(timer)
      timersRef.current.clear()
    },
    [],
  )

  return { presences, typing, apply }
}
