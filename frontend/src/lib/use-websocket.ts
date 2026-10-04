import { useEffect, useRef, useCallback, useState } from "react"

interface UseWebSocketOptions {
  session?: string
  events?: string
  onMessage?: (data: any) => void
}

const RECONNECT_DELAY_MS = 3000

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

    const open = () => {
      if (disposed) return
      const current = wsRef.current
      if (
        current &&
        (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING)
      ) {
        return
      }

      // Browser WebSocket cannot send headers, so dashboard credentials ride
      // in the query string (the server consumes them during the upgrade).
      const stored = localStorage.getItem("waha_dashboard_auth")
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
      let url = `${protocol}//${window.location.host}/ws?session=${encodeURIComponent(session)}&events=${encodeURIComponent(events)}`
      if (stored) {
        try {
          const decoded = atob(stored)
          const [user, pass] = decoded.split(":")
          url += `&user=${encodeURIComponent(user)}&pass=${encodeURIComponent(pass)}`
        } catch {
          // ignore decode errors
        }
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
          reconnectTimeoutRef.current = setTimeout(open, RECONNECT_DELAY_MS)
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

    open()

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
