import { useEffect, useState, useRef, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import {
  Eye,
  Trash2,
  Pause,
  Play,
  Search,
  Download,
  Wifi,
  WifiOff,
} from "lucide-react"
import { Topbar } from "@/components/topbar"
import { useWebSocket } from "@/lib/use-websocket"

const EVENT_COLORS: Record<string, string> = {
  message: "bg-blue-500",
  "message.ack": "bg-green-500",
  "message.reaction": "bg-purple-500",
  "presence.update": "bg-yellow-500",
  "poll.vote": "bg-orange-500",
  "group.join": "bg-emerald-500",
  "group.leave": "bg-red-500",
  error: "bg-red-600",
  warning: "bg-yellow-600",
}

interface LogEntry {
  id: number
  timestamp: string
  event: string
  payload: string
  session?: string
}

export function EventMonitorPage() {
  const [events, setEvents] = useState<LogEntry[]>([])
  const [paused, setPaused] = useState(false)
  const [eventFilter, setEventFilter] = useState("all")
  const [search, setSearch] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)
  const idCounter = useRef(0)
  const pausedRef = useRef(false)

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  const onMessage = useCallback((data: any) => {
    if (pausedRef.current) return
    idCounter.current += 1
    setEvents((prev) =>
      [
        {
          id: idCounter.current,
          timestamp: new Date().toISOString(),
          event: data.event || "unknown",
          payload: JSON.stringify(data.payload || data),
          session: data.session,
        },
        ...prev,
      ].slice(0, 500)
    )
  }, [])

  const { connected } = useWebSocket({ onMessage })

  useEffect(() => {
    if (!paused) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [events, paused])

  const filtered = events.filter((e) => {
    if (eventFilter !== "all" && e.event !== eventFilter) return false
    if (search && !JSON.stringify(e).toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const clearEvents = () => setEvents([])

  const downloadLogs = () => {
    const blob = new Blob(
      [filtered.map((e) => `[${e.timestamp}] ${e.event} ${e.payload}`).join("\n")],
      { type: "text/plain" }
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `waha-events-${Date.now()}.log`
    a.click()
    URL.revokeObjectURL(url)
  }

  const uniqueEvents = [...new Set(events.map((e) => e.event))]

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Event Monitor" onRefresh={clearEvents} />
      <div className="flex-1 overflow-auto p-3 sm:p-6">
        <div className="space-y-4 sm:space-y-6">
          <Alert>
            {connected ? <Wifi className="size-5 text-green-500" /> : <WifiOff className="size-5 text-red-500" />}
            <AlertDescription>
              {connected
                ? "Connected to WebSocket — receiving real-time events."
                : "Disconnected from WebSocket. Retrying..."}
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2">
                <Eye className="size-5" />
                Real-time Events
                <Badge variant="secondary" className="ml-2">
                  {filtered.length}
                </Badge>
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search events..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-8 w-full sm:w-48 pl-8 text-xs"
                  />
                </div>
                <Select value={eventFilter} onValueChange={setEventFilter}>
                  <SelectTrigger className="h-8 w-full sm:w-36 text-xs">
                    <SelectValue placeholder="All Events" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Events</SelectItem>
                    {uniqueEvents.map((ev) => (
                      <SelectItem key={ev} value={ev}>{ev}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => setPaused(!paused)}>
                  {paused ? <Play className="size-5" /> : <Pause className="size-5" />}
                  <span className="hidden sm:inline ml-1">{paused ? "Resume" : "Pause"}</span>
                </Button>
                <Button variant="outline" size="sm" onClick={downloadLogs} className="hidden sm:inline-flex">
                  <Download className="size-5" />
                </Button>
                <Button variant="outline" size="sm" onClick={clearEvents}>
                  <Trash2 className="size-5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <div className="max-h-[600px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Time</th>
                        <th className="hidden sm:table-cell px-3 py-2 text-left font-medium text-muted-foreground">Session</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Event</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Payload</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                            No events yet. Events will appear here in real-time.
                          </td>
                        </tr>
                      ) : (
                        filtered.map((entry) => (
                          <tr key={entry.id} className="border-t border-border hover:bg-muted/50">
                            <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
                              {new Date(entry.timestamp).toLocaleTimeString()}
                            </td>
                            <td className="hidden sm:table-cell px-3 py-1.5">
                              <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
                                {entry.session || "-"}
                              </code>
                            </td>
                            <td className="px-3 py-1.5">
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${EVENT_COLORS[entry.event] || "bg-gray-500"} text-white border-0`}
                              >
                                {entry.event}
                              </Badge>
                            </td>
                            <td className="max-w-[150px] sm:max-w-md truncate px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
                              {entry.payload}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  <div ref={bottomRef} />
                </div>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                {paused ? "Paused" : connected ? "Live (WebSocket)" : "Connecting..."} — Showing {filtered.length} events
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
