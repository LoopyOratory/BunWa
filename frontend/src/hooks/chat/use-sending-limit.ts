import { useCallback, useEffect, useRef, useState } from "react"
import { api, type SendingPolicyState } from "@/lib/api"

const REFRESH_MS = 60_000
/** Below this share of a cap the chat header stays quiet. */
const SHOW_FROM_RATIO = 0.5

export interface LimitLabel {
  text: string
  tone: "ok" | "warning" | "error"
}

/** The one limit worth showing next to the session name, or null. */
export function limitLabelFor(state: SendingPolicyState | null): LimitLabel | null {
  if (!state || state.bypassed || !state.usage.effective.enabled) return null
  const { counts, effective, nextAllowedAt } = state.usage
  if (nextAllowedAt.quietHours) {
    const until = new Date(nextAllowedAt.quietHours).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    return { text: `quiet hours until ${until}`, tone: "warning" }
  }
  const gauges = [
    { label: "per-minute cap", used: counts.lastMinute, cap: effective.maxPerMinute },
    { label: "hourly cap", used: counts.lastHour, cap: effective.maxPerHour },
    { label: "daily cap", used: counts.lastDay, cap: effective.maxPerDay },
    { label: "new-chat quota", used: counts.newChatsLastDay, cap: effective.newChatsPerDay },
  ].map((g) => ({ ...g, ratio: g.cap > 0 ? g.used / g.cap : 0 }))
  const nearest = gauges.reduce((best, g) => (g.ratio > best.ratio ? g : best))
  if (nearest.ratio < SHOW_FROM_RATIO) return null
  if (nearest.ratio >= 1) return { text: `${nearest.label} reached`, tone: "error" }
  return {
    text: `${Math.round(nearest.ratio * 100)}% of ${nearest.label}`,
    tone: nearest.ratio >= 0.8 ? "warning" : "ok",
  }
}

/**
 * The open session's closest sending limit, for the chat list header. Read
 * every 60 s and shortly after a send.
 */
export function useSendingLimit(session: string, working: boolean) {
  const [state, setState] = useState<SendingPolicyState | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionRef = useRef(session)

  const load = useCallback(async () => {
    const requested = sessionRef.current
    if (!requested) return
    try {
      const next = await api.getSendingPolicy(requested)
      if (sessionRef.current === requested) setState(next)
    } catch {
      if (sessionRef.current === requested) setState(null)
    }
  }, [])

  const key = `${session}|${working}`
  const [stateKey, setStateKey] = useState(key)
  if (stateKey !== key) {
    setStateKey(key)
    setState(null)
  }

  useEffect(() => {
    sessionRef.current = session
    if (!session || !working) return
    void load()
    const interval = setInterval(() => void load(), REFRESH_MS)
    return () => clearInterval(interval)
  }, [session, working, load])

  /** Re-read soon (after a send); repeated calls within a second collapse. */
  const refresh = useCallback(() => {
    if (timer.current) return
    timer.current = setTimeout(() => {
      timer.current = null
      void load()
    }, 1_000)
  }, [load])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  return { label: limitLabelFor(state), refresh }
}
