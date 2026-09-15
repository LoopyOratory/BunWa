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
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Eye,
  Trash2,
  Pause,
  Play,
  Search,
  Download,
  Wifi,
  WifiOff,
  Radio,
} from "lucide-react"
import { PageLayout } from "@/components/page-layout"
import { useWebSocket } from "@/lib/use-websocket"
import { cn } from "@/lib/utils"
import { DataTable, TableSkeleton, EmptyState, Metric } from "@/components/primitives"

type EventTone = "info" | "success" | "warning" | "error" | "neutral"

/* Event families collapse onto the five semantic tones instead of one hue per
   event name, so the table stays legible at a glance. */
function eventTone(event: string): EventTone {
  if (event.startsWith("error")) return "error"
  if (event.startsWith("warning")) return "warning"
  if (event.startsWith("message.ack")) return "success"
  if (event.startsWith("message")) return "info"
  if (event.startsWith("group.join")) return "success"
  if (event.startsWith("group.leave")) return "neutral"
  if (event.startsWith("presence")) return "warning"
  if (event.startsWith("poll") || event.startsWith("session")) return "info"
  return "neutral"
}

const TONE_CLASS: Record<EventTone, string> = {
  info: "border-info/30 bg-info/10 text-info",
  success: "border-success-border bg-success-bg text-success-foreground",
  warning: "border-warning-border bg-warning-bg text-warning-foreground",
  error: "border-error-border bg-error-bg text-error-foreground",
  neutral: "border-border bg-muted text-muted-foreground",
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
  const scrollRef = useRef<HTMLDivElement>(null)
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
    if (!paused && scrollRef.current) {
      // DataTable exposes its scroll element, so follow the newest row even
      // though the table scrolls inside its own container.
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
    }
  }, [events, paused])

  const filtered = events.filter((e) => {
    if (eventFilter !== "all" && e.event !== eventFilter) return false
    if (search && !JSON.stringify(e).toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const loading = !connected && events.length === 0

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
    <PageLayout title="Event Monitor" description="Live WebSocket event stream from your WhatsApp sessions">
      <div className="space-y-6">
        <Alert>
          {connected ? (
            <Wifi className="size-4 animate-pulse-soft text-primary" strokeWidth={1.75} />
          ) : (
            <WifiOff className="size-4 text-error" strokeWidth={1.75} />
          )}
          <AlertDescription>
            {connected
              ? "Connected to WebSocket, receiving real-time events."
              : "Disconnected from WebSocket. Retrying."}
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <Eye className="size-4" strokeWidth={1.75} />
              Real-time events
              <Badge variant="secondary" className="ml-1">
                <Metric>{filtered.length}</Metric>
              </Badge>
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 sm:flex-none">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
                <Input
                  placeholder="Search events"
                  aria-label="Search events"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 w-full pl-8 text-xs sm:w-48"
                />
              </div>
              <Select value={eventFilter} onValueChange={setEventFilter}>
                <SelectTrigger className="h-8 w-full text-xs sm:w-36" aria-label="Filter by event type">
                  <SelectValue placeholder="All events" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All events</SelectItem>
                  {uniqueEvents.map((ev) => (
                    <SelectItem key={ev} value={ev}>{ev}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => setPaused(!paused)}>
                {paused ? <Play className="size-4" strokeWidth={1.75} /> : <Pause className="size-4" strokeWidth={1.75} />}
                <span className="ml-1 hidden sm:inline">{paused ? "Resume" : "Pause"}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={downloadLogs}
                className="hidden sm:inline-flex"
                title="Download visible events"
                aria-label="Download visible events"
              >
                <Download className="size-4" strokeWidth={1.75} />
              </Button>
              <Button variant="outline" size="sm" onClick={clearEvents} title="Clear events" aria-label="Clear events">
                <Trash2 className="size-4" strokeWidth={1.75} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <TableSkeleton rows={8} columns={4} />
            ) : filtered.length === 0 ? (
              <EmptyState
                compact
                icon={<Radio strokeWidth={1.75} />}
                title={events.length === 0 ? "No events yet" : "No events match your filters"}
                description={
                  events.length === 0
                    ? "Events from your sessions will appear here as they arrive."
                    : "Try a different search term or event type."
                }
              />
            ) : (
              <DataTable
                className="[&>div>div]:max-h-[600px] [&>div>div]:overflow-y-auto"
                minWidthClassName="min-w-[640px]"
                scrollRef={scrollRef}
              >
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24 text-xs text-muted-foreground">Time</TableHead>
                    <TableHead className="hidden w-40 text-xs text-muted-foreground sm:table-cell">Session</TableHead>
                    <TableHead className="w-44 text-xs text-muted-foreground">Event</TableHead>
                    <TableHead className="text-xs text-muted-foreground">Payload</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap px-3 py-1.5">
                        <Metric className="font-mono text-xs text-muted-foreground">
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </Metric>
                      </TableCell>
                      <TableCell className="hidden px-3 py-1.5 sm:table-cell">
                        <Metric className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                          {entry.session || "-"}
                        </Metric>
                      </TableCell>
                      <TableCell className="px-3 py-1.5">
                        <Badge variant="outline" className={cn("text-xs", TONE_CLASS[eventTone(entry.event)])}>
                          {entry.event}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate px-3 py-1.5 font-mono text-xs text-muted-foreground sm:max-w-md">
                        {entry.payload}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </DataTable>
            )}
            <p className="text-xs text-muted-foreground">
              {paused ? "Paused" : connected ? "Live (WebSocket)" : "Connecting"}. Showing <Metric>{filtered.length}</Metric> events.
            </p>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  )
}
