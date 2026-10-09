import { useEffect, useRef, useCallback, useState } from "react"
import { getApiAuthHeaders } from "./api"

interface UseWebSocketOptions {
  session?: string
  events?: string
  onMessage?: (data: any) => void
}

const RECONNECT_DELAY_MS = 3000

/**
 * Trade the dashboard credentials for a single-use WebSocket ticket. A browser
 * WebSocket cannot send headers, and putting the password in the /ws URL leaks
 * it into proxy and access logs. Returns null when no ticket can be had (e.g.
 * a keyless dev server), in which case the socket connects without one.
 */
async function fetchWsTicket(): Promise<string | null> {
  try {
    const res = await fetch(`${window.location.origin}/api/ws/ticket`, {
      method: "POST",
      headers: getApiAuthHeaders(),
    })
    if (!res.ok) return null
    const body = await res.json()
    return typeof body?.ticket === "string" ? body.ticket : null
  } catch {
    return null
  }
}

export function useWebSocket({ session = "*", events = "*", onMessage }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [connected, setConnected] = useState(false)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  // Connecting depends only on the primitive session/events strings, so a
  // re-render of the consumer never tears the socket down.
  useEffect(() => {
    let disposed = false

    // A connection attempt in flight (waiting on its ticket) counts as open,
    // so a reconnect timer cannot start a second one beside it.
    let opening = false

    const open = async () => {
      if (disposed || opening) return
      const current = wsRef.current
      if (
        current &&
        (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING)
      ) {
        return
      }

      opening = true
      const ticket = await fetchWsTicket()
      opening = false
      // The consumer unmounted or switched session while the ticket was in flight.
      if (disposed) return

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
      let url = `${protocol}//${window.location.host}/ws?session=${encodeURIComponent(session)}&events=${encodeURIComponent(events)}`
      if (ticket) {
        url += `&ticket=${encodeURIComponent(ticket)}`
      }

      const ws = new WebSocket(url)
      wsRef.current = ws
      const isOwner = () => wsRef.current === ws

      ws.onopen = () => {
        if (!disposed && isOwner()) setConnected(true)
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          onMessageRef.current?.(data)
        } catch {
          // ignore parse errors
        }
      }

      ws.onclose = () => {
        // A close caused by cleanup or by switching sessions must not touch
        // the newer socket's state, and must not arm a reconnect: only a
        // connection lost while this socket still owns the ref retries.
        if (!isOwner()) return
        wsRef.current = null
        setConnected(false)
        if (!disposed) {
          reconnectTimeoutRef.current = setTimeout(() => void open(), RECONNECT_DELAY_MS)
        }
      }

      ws.onerror = () => {
        try {
          ws.close()
        } catch {
          // already closed
        }
      }
    }

    void open()

    return () => {
      disposed = true
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      const ws = wsRef.current
      wsRef.current = null
      ws?.close()
    }
  }, [session, events])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    const ws = wsRef.current
    wsRef.current = null
    ws?.close()
  }, [])

  return { connected, disconnect }
}
