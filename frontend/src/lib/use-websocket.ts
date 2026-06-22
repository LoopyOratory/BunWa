import { useEffect, useRef, useCallback, useState } from "react"

interface UseWebSocketOptions {
  session?: string
  events?: string
  onMessage?: (data: any) => void
}

export function useWebSocket({ session = "*", events = "*", onMessage }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [connected, setConnected] = useState(false)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    // Get stored dashboard credentials for WS auth
    // (browser WebSocket API doesn't support custom headers)
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

    ws.onopen = () => {
      setConnected(true)
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
      setConnected(false)
      wsRef.current = null
      reconnectTimeoutRef.current = setTimeout(connect, 3000)
    }

    ws.onerror = () => {
      ws.close()
    }

    wsRef.current = ws
  }, [session, events])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectTimeoutRef.current)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect])

  const disconnect = useCallback(() => {
    clearTimeout(reconnectTimeoutRef.current)
    wsRef.current?.close()
    wsRef.current = null
  }, [])

  return { connected, disconnect }
}
