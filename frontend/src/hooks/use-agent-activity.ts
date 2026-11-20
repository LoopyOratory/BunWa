import { useEffect, useRef } from "react"
import { getApiAuthHeaders } from "@/lib/api"

/**
 * Subscribe to the server's live agent-activity stream.
 *
 * The browser's EventSource cannot send headers, so the hook trades the
 * dashboard credentials for a single-use ticket first (the same flow the
 * /ws channel uses) and connects to /api/agent-activity/stream?ticket=.
 * Every `agent.activity` event schedules one trailing-edge refresh: bursts
 * (a start and an immediate end) coalesce into a single callback, and the
 * LAST event always lands — a leading-edge drop would swallow an end
 * heartbeat that follows a start within the window and pin a stale badge.
 * When no ticket can be had — a keyless dev server, an offline server —
 * the hook stays silent and normal polling remains the only update path.
 */
export function useAgentActivityStream(onActivity: () => void, debounceMs = 300) {
  const onActivityRef = useRef(onActivity)
  // Keep the latest callback without re-subscribing the stream; refs are
  // written in an effect, never during render.
  useEffect(() => {
    onActivityRef.current = onActivity
  })

  useEffect(() => {
    let disposed = false
    let source: EventSource | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const close = () => {
      source?.close()
      source = null
    }

    const scheduleRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        onActivityRef.current()
      }, debounceMs)
    }

    const open = async () => {
      try {
        const response = await fetch(`${window.location.origin}/api/ws/ticket`, {
          method: "POST",
          headers: getApiAuthHeaders(),
        })
        if (!response.ok) return
        const body = (await response.json().catch(() => null)) as { ticket?: string } | null
        if (disposed || typeof body?.ticket !== "string") return
        const stream = new EventSource(`/api/agent-activity/stream?ticket=${encodeURIComponent(body.ticket)}`)
        source = stream
        stream.addEventListener("agent.activity", scheduleRefresh)
        stream.onerror = () => {
          close()
          if (!disposed) retryTimer = setTimeout(() => void open(), 5_000)
        }
      } catch {
        if (!disposed) retryTimer = setTimeout(() => void open(), 5_000)
      }
    }

    void open()
    return () => {
      disposed = true
      close()
      if (retryTimer) clearTimeout(retryTimer)
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [debounceMs])
}
