import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  MessageCircle,
  MessagesSquare,
  Phone,
  Radio,
  Search,
  Star,
  UserRound,
} from "lucide-react"
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { useWebSocket } from "@/lib/use-websocket"
import { formatNumber, formatRating, outcomeLabel, outcomeTone } from "@/lib/agent-analytics-format"
import {
  agentApi,
  type Agent,
  type AnalyticsChannel,
  type AnalyticsRangeKey,
  type ConversationMessage,
  type ConversationPage,
  type ConversationSummary,
} from "@/lib/agents-api"

const PAGE_SIZE = 25
const LIST_POLL_MS = 5_000
const TRANSCRIPT_POLL_MS = 4_000

function formatWhen(value: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatClock(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
}

function conversationOutcome(row: ConversationSummary): string {
  const raw = row.metadata?.outcome
  if (typeof raw === "string") return raw
  if (row.status === "open" || row.status === "closing") return "open"
  return "resolved"
}

function StatusBadge({ status, channel }: { status: ConversationSummary["status"]; channel: string }) {
  const ChannelIcon = channel === "voice" ? Phone : MessageCircle
  const tone =
    status === "open"
      ? "border-success-border/70 bg-success-bg/70 text-success-foreground"
      : status === "closing"
        ? "border-warning-border/70 bg-warning-bg/70 text-warning-foreground"
        : "border-border/70 bg-muted/45 text-muted-foreground"
  return (
    <Badge variant="outline" className={cn("gap-1.5 border px-2 py-0.5 font-medium capitalize", tone)}>
      <span className="inline-flex" title={channel === "voice" ? "Voice" : "Chat"}>
        <ChannelIcon className="size-3.5" aria-hidden />
      </span>
      <span className={cn("size-1.5 rounded-full", status === "open" ? "bg-success" : status === "closing" ? "bg-warning" : "bg-muted-foreground/45")} />
      {status}
    </Badge>
  )
}

function ChannelBadge({ channel }: { channel: string }) {
  const Icon = channel === "voice" ? Phone : MessageCircle
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className="size-3.5" />
      {channel === "voice" ? "Voice" : "Chat"}
    </span>
  )
}

function SortHeader({
  label,
  column,
}: {
  label: string
  column: { getToggleSortingHandler: () => ((event: unknown) => void) | undefined; getIsSorted: () => false | "asc" | "desc" }
}) {
  const sorted = column.getIsSorted()
  return (
    <button
      type="button"
      className="-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground"
      onClick={column.getToggleSortingHandler()}
    >
      {label}
      {sorted === "asc" ? (
        <ArrowUp className="size-3" />
      ) : sorted === "desc" ? (
        <ArrowDown className="size-3" />
      ) : (
        <ArrowUpDown className="size-3 opacity-40" />
      )}
    </button>
  )
}

function TranscriptSheet({
  conversation,
  open,
  onOpenChange,
  live,
}: {
  conversation: ConversationSummary | null
  open: boolean
  onOpenChange: (open: boolean) => void
  live: boolean
}) {
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async () => {
    if (!conversation) return
    try {
      const result = await agentApi.conversationMessages(conversation.id, { limit: 300 })
      setMessages(result.messages)
      setError(null)
      setUpdatedAt(new Date().toISOString())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load transcript")
    } finally {
      setLoading(false)
    }
  }, [conversation])

  useEffect(() => {
    if (!open || !conversation) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    void load()
    if (!live) return
    const interval = setInterval(() => void load(), TRANSCRIPT_POLL_MS)
    return () => clearInterval(interval)
  }, [conversation, live, load, open])

  useEffect(() => {
    if (!open || messages.length === 0) return
    bottomRef.current?.scrollIntoView({ block: "end" })
  }, [messages.length, open])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader className="border-b border-border/60 pb-4 pe-12">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-strong">
              <UserRound className="size-5" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="truncate">
                {conversation?.contactName || conversation?.contactPhone || conversation?.userId || "Conversation"}
              </SheetTitle>
              <SheetDescription className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="capitalize">{conversation?.status}</span>
                <span aria-hidden>·</span>
                <ChannelBadge channel={conversation?.channel ?? "whatsapp"} />
                <span aria-hidden>·</span>
                <span>{formatWhen(conversation?.startedAt ?? null)}</span>
              </SheetDescription>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{formatNumber(messages.length)} messages</Badge>
            {conversation?.reviewRating ? (
              <Badge variant="outline" className="gap-1">
                <Star className="size-3 fill-current" />
                {formatRating(conversation.reviewRating)}
              </Badge>
            ) : null}
            {live && (
              <span
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-success-foreground"
                title="Pushes on new messages; polls every few seconds as a fallback"
              >
                <span className="size-1.5 animate-pulse rounded-full bg-success" />
                Live
              </span>
            )}
            {updatedAt && <span className="ms-auto text-[10px] text-muted-foreground">Updated {formatClock(updatedAt)}</span>}
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {loading && messages.length === 0 ? (
            <div className="space-y-3">
              <div className="h-16 w-3/4 animate-pulse rounded-2xl bg-muted" />
              <div className="ms-auto h-12 w-1/2 animate-pulse rounded-2xl bg-primary-soft" />
              <div className="h-20 w-4/5 animate-pulse rounded-2xl bg-muted" />
            </div>
          ) : error && messages.length === 0 ? (
            <p className="rounded-lg border border-error-border bg-error-bg px-4 py-3 text-sm text-error-foreground">{error}</p>
          ) : messages.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 px-6 text-center">
              <MessageCircle className="size-6 text-muted-foreground" />
              <p className="text-sm font-medium">No transcript yet</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Messages appear here when the agent runtime writes to this conversation. The table will update on the next live refresh.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((message) => {
                if (message.role === "system" || message.role === "tool") {
                  return (
                    <div key={message.id} className="flex items-center gap-2 py-1">
                      <span className="h-px flex-1 bg-border/60" />
                      <span className="max-w-[80%] text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {message.role === "tool" ? "Tool" : "System"} · {message.text}
                      </span>
                      <span className="h-px flex-1 bg-border/60" />
                    </div>
                  )
                }
                const mine = message.role === "agent"
                return (
                  <div key={message.id} className={cn("flex items-end gap-2", mine && "flex-row-reverse")}>
                    <div
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                        mine ? "bg-primary-strong text-primary-foreground" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {mine ? "AI" : "C"}
                    </div>
                    <div className={cn("max-w-[82%] space-y-1", mine && "items-end")}>
                      <div
                        className={cn(
                          "whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm/relaxed",
                          mine
                            ? "rounded-br-sm bg-primary-strong text-primary-foreground"
                            : "rounded-bl-sm bg-muted text-foreground",
                        )}
                      >
                        {message.text}
                      </div>
                      <p className={cn("px-1 text-[10px] text-muted-foreground", mine && "text-end")}>
                        {message.role === "agent" ? "Agent" : "Customer"} · {formatClock(message.createdAt)}
                      </p>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {error && messages.length > 0 && (
          <p className="border-t border-error-border/60 bg-error-bg px-6 py-2 text-xs text-error-foreground">
            Live refresh failed: {error}
          </p>
        )}
      </SheetContent>
    </Sheet>
  )
}

export function ConversationHistoryTable({
  agents,
  agentId,
  channel,
  range,
  rangeLabel,
  from,
  to,
  onSelectAgent,
}: {
  agents: Agent[]
  agentId: string | null
  channel: AnalyticsChannel
  range: AnalyticsRangeKey
  rangeLabel: string
  from: string | null
  to: string | null
  onSelectAgent?: (agentId: string) => void
}) {
  const [result, setResult] = useState<ConversationPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [status, setStatus] = useState<"all" | "open" | "closing" | "closed">("all")
  const [live, setLive] = useState(true)
  const [sorting, setSorting] = useState<SortingState>([{ id: "startedAt", desc: true }])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: PAGE_SIZE })
  const [selected, setSelected] = useState<ConversationSummary | null>(null)
  const [transcriptOpen, setTranscriptOpen] = useState(false)

  const agentNames = useMemo(() => new Map(agents.map((agent) => [agent.id, agent.name])), [agents])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300)
    return () => clearTimeout(timer)
  }, [query])

  const load = useCallback(
    async () => {
      try {
        const next = await agentApi.conversations({
          agentId,
          channel,
          range,
          status: status === "all" ? null : status,
          from,
          to,
          q: debouncedQuery,
          page: pagination.pageIndex + 1,
          pageSize: pagination.pageSize,
        })
        setResult(next)
        setError(null)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not load chat history")
      } finally {
        setLoading(false)
      }
    },
    [agentId, channel, debouncedQuery, from, pagination.pageIndex, pagination.pageSize, range, status, to],
  )

  useEffect(() => {
    void load()
    if (!live) return
    const interval = setInterval(() => void load(), LIST_POLL_MS)
    return () => clearInterval(interval)
  }, [live, load])

  /* Push-driven refresh: a WhatsApp message event may have written new
     conversation rows. The WebSocket makes updates land immediately; the
     interval above stays as the fallback. Debounced to one refresh/second. */
  const pushRef = useRef(0)
  useWebSocket({
    events: "message,message.any",
    onMessage: () => {
      if (!live) return
      const now = Date.now()
      if (now - pushRef.current < 1_000) return
      pushRef.current = now
      void load()
    },
  })

  useEffect(() => {
    // A filter change starts a new result set; keep the user on page one.
    setPagination((current) => (current.pageIndex === 0 ? current : { ...current, pageIndex: 0 }))
  }, [agentId, channel, debouncedQuery, from, range, status, to])

  const resetPage = () => {
    if (pagination.pageIndex !== 0) setPagination((current) => ({ ...current, pageIndex: 0 }))
  }

  const columns = useMemo<ColumnDef<ConversationSummary>[]>(() => {
    return [
      {
        id: "contact",
        header: "Contact",
        cell: ({ row }) => {
          const contact = row.original.contactName || row.original.contactPhone || row.original.userId || "Unknown"
          const detail = row.original.contactName ? row.original.contactPhone || row.original.userId : row.original.userId
          return (
            <div className="flex min-w-40 items-center gap-2.5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-strong">
                <UserRound className="size-3.5" />
              </div>
              <div className="min-w-0">
                <p className="max-w-40 truncate text-sm font-medium">{contact}</p>
                {detail && detail !== contact && <p className="max-w-40 truncate text-[11px] text-muted-foreground">{detail}</p>}
              </div>
            </div>
          )
        },
      },
      {
        id: "agent",
        header: "Agent",
        cell: ({ row }) => (
          <button
            type="button"
            className="max-w-36 truncate text-start text-sm hover:text-primary"
            onClick={(event) => {
              event.stopPropagation()
              onSelectAgent?.(row.original.agentId)
            }}
          >
            {agentNames.get(row.original.agentId) || "Unknown agent"}
          </button>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} channel={row.original.channel} />,
      },
      {
        id: "lastMessage",
        header: "Last message",
        cell: ({ row }) => (
          <p className="max-w-[13rem] truncate text-sm text-muted-foreground">
            {row.original.lastMessage ? (
              <>
                <span className="font-medium text-foreground/75">
                  {row.original.lastMessageRole === "agent" ? "Agent" : row.original.lastMessageRole === "customer" ? "Customer" : "System"}:
                </span>{" "}
                {row.original.lastMessage}
              </>
            ) : (
              <span className="italic">No transcript yet</span>
            )}
          </p>
        ),
      },
      {
        id: "messages",
        header: ({ column }) => <SortHeader label="Msgs" column={column} />,
        accessorFn: (row) => row.messageCount,
        cell: ({ row }) => <span className="tabular-nums text-sm">{formatNumber(row.original.messageCount)}</span>,
      },
      {
        id: "outcome",
        header: "Outcome",
        cell: ({ row }) => {
          const outcome = conversationOutcome(row.original)
          const tone = outcomeTone(outcome)
          return (
            <Badge
              variant="outline"
              className={cn(
                "capitalize",
                tone === "success" && "border-success-border bg-success-bg text-success-foreground",
                tone === "warning" && "border-warning-border bg-warning-bg text-warning-foreground",
                tone === "error" && "border-error-border bg-error-bg text-error-foreground",
                tone === "info" && "border-border bg-muted text-muted-foreground",
              )}
            >
              {outcomeLabel(outcome)}
            </Badge>
          )
        },
      },
      {
        id: "rating",
        header: ({ column }) => <SortHeader label="CSAT" column={column} />,
        accessorFn: (row) => row.reviewRating ?? 0,
        cell: ({ row }) =>
          row.original.reviewRating ? (
            <span className="inline-flex items-center gap-1 text-sm tabular-nums">
              <Star className="size-3.5 fill-current text-warning-foreground" />
              {formatRating(row.original.reviewRating)}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          ),
      },
      {
        id: "startedAt",
        header: ({ column }) => <SortHeader label="Started" column={column} />,
        accessorFn: (row) => row.startedAt,
        cell: ({ row }) => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatWhen(row.original.startedAt)}</span>,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label={`Open transcript for ${row.original.contactName || row.original.contactPhone || row.original.id}`}
            title="Open transcript"
            onClick={(event) => {
              event.stopPropagation()
              setSelected(row.original)
              setTranscriptOpen(true)
            }}
          >
            <ChevronRight className="size-4" />
          </Button>
        ),
      },
    ]
  }, [agentNames, onSelectAgent])

  const pageCount = Math.max(1, Math.ceil((result?.total ?? 0) / pagination.pageSize))
  const table = useReactTable({
    data: result?.conversations ?? [],
    columns,
    state: { pagination, sorting },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    pageCount,
  })

  const total = result?.total ?? 0
  const start = total === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1
  const end = Math.min(total, (pagination.pageIndex + 1) * pagination.pageSize)

  return (
    <>
      <Card className="glass-card gap-0 overflow-hidden rounded-xl border border-border/70 p-0 shadow-sm">
        <div className="border-b border-border/60 bg-gradient-to-br from-primary-soft/55 via-card/45 to-card/20 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-card/80 text-primary-strong shadow-xs">
                <MessagesSquare className="size-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-heading text-base font-semibold tracking-tight">Chat history &amp; transcripts</h3>
                  <Badge variant="outline" className="tabular-nums">{formatNumber(total)}</Badge>
                  {live && (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full border border-success-border/60 bg-success-bg/80 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success-foreground"
                      title="Pushes on new messages; polls every few seconds as a fallback"
                    >
                      <Radio className="size-3 animate-pulse" />
                      Live
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {rangeLabel} · open a row to read the full transcript.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-1.5 shadow-xs">
              <Label htmlFor="live-transcripts" className="cursor-pointer text-xs font-medium text-muted-foreground">
                Live refresh
              </Label>
              <Switch id="live-transcripts" checked={live} onCheckedChange={setLive} aria-label="Live refresh chat history" />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-card/35 px-5 py-3">
          <div className="relative min-w-56 flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                resetPage()
              }}
              placeholder="Search name, number or transcript"
              className="h-9 ps-8 text-xs"
              aria-label="Search chat history"
            />
          </div>
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value as typeof status)
              resetPage()
            }}
          >
            <SelectTrigger className="h-9 w-36 text-xs" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="closing">Closing</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <span className="ms-auto text-[11px] font-medium text-muted-foreground">
            {formatNumber(total)} conversation{total === 1 ? "" : "s"}
          </span>
        </div>

        {error && !result ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-medium text-destructive">Could not load chat history</p>
            <p className="mt-1 text-xs text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : loading && !result ? (
          <div className="space-y-3 px-5 py-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center gap-4">
                <div className="size-8 animate-pulse rounded-full bg-muted" />
                <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="max-h-[560px] overflow-auto">
              <table className="w-full caption-bottom text-sm">
                <TableHeader className="sticky top-0 z-10 bg-card/95 shadow-[0_1px_0_0_var(--border)] backdrop-blur-sm">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id} className="hover:bg-transparent">
                      {headerGroup.headers.map((header) => (
                        <TableHead key={header.id} className="h-10 px-1.5 py-2.5">
                          {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="py-14 text-center">
                        <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
                          <MessageCircle className="size-7 text-muted-foreground" />
                          <p className="text-sm font-medium">No conversations in this range</p>
                          <p className="text-xs text-muted-foreground">
                            Try a wider date range, or clear the status and search filters.
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    table.getRowModel().rows.map((row) => (
                      <TableRow
                        key={row.id}
                        className={cn(
                          "group cursor-pointer",
                          row.original.status === "open" && "border-s-2 border-s-success/55",
                        )}
                        tabIndex={0}
                        onClick={() => {
                          setSelected(row.original)
                          setTranscriptOpen(true)
                        }}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault()
                            setSelected(row.original)
                            setTranscriptOpen(true)
                          }
                        }}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id} className="px-1.5 py-3">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-medium text-muted-foreground">Rows per page</span>
                <Select
                  value={String(pagination.pageSize)}
                  onValueChange={(value) => {
                    setPagination({ pageIndex: 0, pageSize: Number(value) })
                  }}
                >
                  <SelectTrigger className="h-8 w-24 text-xs" aria-label="Rows per page">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
                <span className="ms-1 text-xs tabular-nums text-muted-foreground">
                  {total === 0 ? "No conversations" : `${formatNumber(start)}–${formatNumber(end)} of ${formatNumber(total)}`}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="First page"
                  onClick={() => table.firstPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  <ChevronsLeft className="size-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Previous page"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <span className="min-w-20 px-1 text-center text-xs tabular-nums text-muted-foreground">
                  Page {pagination.pageIndex + 1} of {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Next page"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                >
                  <ChevronRight className="size-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Last page"
                  onClick={() => table.lastPage()}
                  disabled={!table.getCanNextPage()}
                >
                  <ChevronsRight className="size-3.5" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      <TranscriptSheet
        conversation={selected}
        open={transcriptOpen}
        onOpenChange={(open) => {
          setTranscriptOpen(open)
          if (!open) setSelected(null)
        }}
        live={live}
      />
    </>
  )
}
