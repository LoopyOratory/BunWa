import { useCallback, useEffect, useRef, useState } from "react"
import { api, type DashboardRange, type DashboardSummary } from "@/lib/api"
import { useWebSocket } from "@/lib/use-websocket"

const POLL_MS = 10_000

/**
 * The ops dashboard's data: one summary call every 10 s, plus session status
 * changes applied the moment they arrive over the WebSocket, so a session
 * that drops shows up without waiting for the next poll.
 *
 * A response for a range the user has since switched away from is dropped.
 */
export function useDashboardSummary(range: DashboardRange) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The range the last settled request was for; loading until it matches.
  const [settledRange, setSettledRange] = useState<DashboardRange | null>(null)
  const rangeRef = useRef(range)
  useEffect(() => {
    rangeRef.current = range
  }, [range])

  const load = useCallback(async () => {
    const requested = range
    try {
      const next = await api.getDashboardSummary(requested)
      if (rangeRef.current !== requested) return
      setSummary(next)
      setError(null)
    } catch (e) {
      if (rangeRef.current !== requested) return
      setError(e instanceof Error ? e.message : "Could not load the dashboard")
    } finally {
      if (rangeRef.current === requested) setSettledRange(requested)
    }
  }, [range])

  useEffect(() => {
    const first = setTimeout(() => void load(), 0)
    const interval = setInterval(() => void load(), POLL_MS)
    return () => {
      clearTimeout(first)
      clearInterval(interval)
    }
  }, [load])

  const onEvent = useCallback(
    (data: { event?: string; session?: string; payload?: { status?: string } }) => {
      if (data?.event !== "session.status" || !data.session || !data.payload?.status) return
      const status = data.payload.status as DashboardSummary["sessions"][number]["status"]
      const name = data.session
      setSummary((prev) => {
        if (!prev) return prev
        const index = prev.sessions.findIndex((s) => s.name === name)
        if (index === -1 || prev.sessions[index].status === status) return prev
        const sessions = prev.sessions.slice()
        sessions[index] = { ...sessions[index], status, statusSince: new Date().toISOString() }
        return { ...prev, sessions }
      })
      // The attention list depends on status too; refresh it now.
      void load()
    },
    [load],
  )
  useWebSocket({ session: "*", events: "session.status", onMessage: onEvent })

  return { summary, error, loading: settledRange !== range, reload: load }
}
