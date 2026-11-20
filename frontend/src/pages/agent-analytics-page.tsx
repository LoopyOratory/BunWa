import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import {
  Bot,
  CalendarRange,
  CheckCircle2,
  Download,
  Handshake,
  MessageCircle,
  MessagesSquare,
  Phone,
  RefreshCw,
  Star,
  Timer,
  Wallet,
} from "lucide-react"
import { toast } from "sonner"
import { PageLayout } from "@/components/page-layout"
import { EmptyState, ErrorState, Skeleton } from "@/components/primitives"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { agentApi, type Agent, type AgentAnalyticsDashboard, type AnalyticsChannel, type AnalyticsRangeKey } from "@/lib/agents-api"
import { cn } from "@/lib/utils"
import { formatMoney, formatNumber, formatPercent } from "@/lib/agent-analytics-format"
import {
  AgentKpiCard,
  CsatCard,
  FunnelCard,
  VolumeOutcomeChart,
} from "@/components/agent-analytics/agent-analytics-charts"
import { DateRangePicker } from "@/components/agent-analytics/date-range-picker"
import {
  AttentionPanel,
  KnowledgeGapsPanel,
  LeaderboardPanel,
  RecentConversationsPanel,
  ToolHealthPanel,
  TopicsPanel,
} from "@/components/agent-analytics/agent-analytics-panels"
import { ConversationHistoryTable } from "@/components/agent-analytics/conversation-history-table"

const RANGES: AnalyticsRangeKey[] = ["24h", "7d", "30d", "90d"]
const CHANNELS: Array<{ value: AnalyticsChannel; label: string; icon: typeof MessageCircle }> = [
  { value: "all", label: "All", icon: MessagesSquare },
  { value: "whatsapp", label: "Chat", icon: MessageCircle },
  { value: "voice", label: "Voice", icon: Phone },
]
const ALL = "__all__"
const POLL_MS = 30_000

function isRange(value: string | null): value is AnalyticsRangeKey {
  return value === "24h" || value === "7d" || value === "30d" || value === "90d"
}

function isChannel(value: string | null): value is AnalyticsChannel {
  return value === "all" || value === "whatsapp" || value === "voice"
}

function isDateInput(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
}

function formatDateRange(from: string | null, to: string | null): string {
  if (!from || !to) return "custom range"
  const start = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "custom range"
  const format = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
  return `${format(start)} – ${format(end)}`
}

function rangeLabel(range: AnalyticsRangeKey): string {
  return range === "24h" ? "last 24 hours" : range === "7d" ? "last 7 days" : range === "30d" ? "last 30 days" : "last 90 days"
}

function downloadCsv(data: AgentAnalyticsDashboard) {
  const lines: string[][] = [
    ["Metric", "Value"],
    ["Conversations", String(data.totals.conversations)],
    ["Engaged", String(data.totals.engaged)],
    ["Resolved", String(data.totals.resolved)],
    ["Converted", String(data.totals.converted)],
    ["Handoffs", String(data.totals.handoffs)],
    ["Reviews", String(data.totals.reviews)],
    ["Average rating", data.totals.averageRating === null ? "" : data.totals.averageRating.toFixed(2)],
    ["Range", `${data.from} → ${data.to}`],
    [],
    ["Agent", "Conversations", "Resolved", "CSAT", "Median response (ms)", "Cost per conversation (cents)"],
    ...data.leaderboard.map((row) => [
      row.agentName,
      String(row.conversations),
      String(row.resolved),
      row.csat === null ? "" : row.csat.toFixed(2),
      row.medianResponseMs === null ? "" : String(Math.round(row.medianResponseMs)),
      row.costPerConversationCents === null ? "" : String(Math.round(row.costPerConversationCents)),
    ]),
    [],
    ["Topic", "Conversations", "Resolved", "Conversion rate"],
    ...data.topics.map((row) => [row.topic, String(row.conversations), String(row.resolved), row.conversionRate === null ? "" : String(row.conversionRate)]),
  ]
  const csv = lines
    .map((row) => row.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(","))
    .join("\n")
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `agent-analytics-${data.range}-${new Date().toISOString().slice(0, 10)}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function AgentAnalyticsPage() {
  const [params, setParams] = useSearchParams()
  const range = isRange(params.get("range")) ? (params.get("range") as AnalyticsRangeKey) : "7d"
  const channel = isChannel(params.get("channel")) ? (params.get("channel") as AnalyticsChannel) : "all"
  const agentId = params.get("agentId") || null
  const fromDate = isDateInput(params.get("from")) ? params.get("from") : null
  const toDate = isDateInput(params.get("to")) ? params.get("to") : null
  const customRange = Boolean(fromDate && toDate)
  const activeRangeLabel = customRange ? formatDateRange(fromDate, toDate) : rangeLabel(range)

  const [agents, setAgents] = useState<Agent[]>([])
  const [data, setData] = useState<AgentAnalyticsDashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const requestKey = `${range}|${channel}|${agentId ?? ""}|${fromDate ?? ""}|${toDate ?? ""}`
  const [settledKey, setSettledKey] = useState<string | null>(null)
  const isLoading = loading || settledKey !== requestKey

  const setFilter = (key: "range" | "channel" | "agentId", value: string | undefined) => {
    const next = new URLSearchParams(params)
    if (key === "range") {
      next.delete("from")
      next.delete("to")
    }
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const setDateRange = (from: string | null, to: string | null) => {
    const next = new URLSearchParams(params)
    if (from && to) {
      next.set("from", from)
      next.set("to", to)
    } else {
      next.delete("from")
      next.delete("to")
    }
    setParams(next, { replace: true })
  }

  const load = useCallback(
    async (quiet = false) => {
      const key = `${range}|${channel}|${agentId ?? ""}|${fromDate ?? ""}|${toDate ?? ""}`
      if (quiet) setRefreshing(true)
      try {
        const [next, agentList] = await Promise.all([
          agentApi.analyticsDashboard({ range, channel, agentId, from: fromDate, to: toDate }),
          agentApi.list(),
        ])
        setData(next)
        setAgents(agentList)
        setError(null)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not load agent analytics")
      } finally {
        setSettledKey(key)
        setLoading(false)
        setRefreshing(false)
      }
    },
    [agentId, channel, fromDate, range, toDate],
  )

  useEffect(() => {
    // Fetching is an external-system sync; the state update happens after the request settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    const interval = setInterval(() => void load(true), POLL_MS)
    return () => clearInterval(interval)
    // load is intentionally keyed by the filters; agents is stable after the first fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey])

  const selectedAgent = useMemo(() => agents.find((agent) => agent.id === agentId) ?? null, [agents, agentId])
  const showEmpty = !isLoading && agents.length === 0 && !error

  const selectAgent = (id: string) => {
    setFilter("agentId", id === agentId ? undefined : id)
  }

  const exportCsv = () => {
    if (!data) return
    downloadCsv(data)
    toast.success("Agent analytics CSV downloaded")
  }

  return (
    <PageLayout
      title="Agent analytics"
      eyebrow="Overview · Agent performance"
      status={
        <span
          className="inline-flex items-center gap-1.5 rounded-full border border-success-border/60 bg-success-bg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-success-foreground"
          title={data ? `Updated ${new Date(data.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · refreshes automatically` : "Waiting for data"}
        >
          <span className="size-1.5 animate-pulse rounded-full bg-success" />
          Live
        </span>
      }
      meta={
        <>
          <Badge variant="outline" className="gap-1.5 font-medium">
            <Bot className="size-3.5 text-primary-strong" />
            {selectedAgent?.name ?? "All agents"}
          </Badge>
          <Badge variant="outline" className="gap-1.5 font-medium">
            <CalendarRange className="size-3.5 text-primary-strong" />
            {activeRangeLabel}
          </Badge>
        </>
      }
      description="How chat and voice agents perform, where they need help, and what they cost."
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load(true)} disabled={refreshing || isLoading}>
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data}>
            <Download className="size-4" />
            Export
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="glass-card flex flex-wrap items-center gap-2 rounded-lg p-2.5">
          <Select value={agentId ?? ALL} onValueChange={(value) => setFilter("agentId", value === ALL ? undefined : value)}>
            <SelectTrigger className="h-9 w-full min-w-44 sm:w-52" aria-label="Agent">
              <SelectValue placeholder="All agents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All agents</SelectItem>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex rounded-full border border-border/70 bg-card/60 p-0.5" role="group" aria-label="Channel">
            {CHANNELS.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={channel === item.value}
                  onClick={() => setFilter("channel", item.value === "all" ? undefined : item.value)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                    channel === item.value ? "bg-primary-strong text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                  {item.label}
                </button>
              )
            })}
          </div>

          <DateRangePicker
            from={fromDate}
            to={toDate}
            onApply={(from, to) => setDateRange(from, to)}
            onClear={() => setDateRange(null, null)}
          />

          <div className="ms-auto flex rounded-full border border-border/70 bg-card/60 p-0.5" role="group" aria-label="Time range">
            {RANGES.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={!customRange && range === key}
                onClick={() => setFilter("range", key === "7d" ? undefined : key)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                  !customRange && range === key ? "bg-primary-strong text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {key}
              </button>
            ))}
          </div>
        </div>

        {isLoading && !data ? (
          <AnalyticsSkeleton />
        ) : error && !data ? (
          <ErrorState title="Could not load agent analytics" description={error} onRetry={() => void load()} />
        ) : showEmpty ? (
          <EmptyState
            icon={<Bot className="size-6" />}
            title="No agents yet"
            description="Create an agent, connect a WhatsApp session, and the analytics will fill in as conversations happen."
            action={
              <Button asChild>
                <Link to="/agents">Create an agent</Link>
              </Button>
            }
          />
        ) : data ? (
          <>
            {error && <p className="text-xs text-warning-foreground">Showing the last answer; refresh failed: {error}</p>}
            {data.totals.conversations === 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border/70 bg-card/50 px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  No conversations in the {activeRangeLabel} yet. Analytics fill in automatically as your agents handle real chats and calls.
                </p>
                <Link to="/agents" className="text-xs font-semibold text-primary underline-offset-4 hover:underline">
                  Open agents
                </Link>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
              <AgentKpiCard
                label="Conversations"
                kpi={data.kpis.conversations}
                currency={data.currency}
                hint={`${formatNumber(data.totals.engaged)} engaged · ${formatNumber(data.totals.converted)} converted`}
                sparkline={data.series.map((point) => point.started)}
                icon={<MessagesSquare className="size-4" />}
              />
              <AgentKpiCard
                label="Resolution"
                kpi={data.kpis.resolution}
                currency={data.currency}
                hint={`${formatNumber(data.totals.resolved)} of ${formatNumber(data.totals.engaged)} engaged`}
                sparkline={data.series.map((point) => point.resolved)}
                icon={<CheckCircle2 className="size-4" />}
              />
              <AgentKpiCard
                label="CSAT"
                kpi={data.kpis.csat}
                currency={data.currency}
                hint={`${formatNumber(data.totals.reviews)} reviews · ${formatPercent(data.totals.reviewResponseRate)} response`}
                sparkline={data.series.map((point) => point.avgRating ?? 0)}
                icon={<Star className="size-4" />}
              />
              <AgentKpiCard
                label="First response"
                kpi={data.kpis.firstResponse}
                currency={data.currency}
                hint="Median time to the first agent reply"
                sparkline={data.series.map((point) => point.medianResponseMs ?? 0)}
                icon={<Timer className="size-4" />}
                invert
              />
              <AgentKpiCard
                label="Human handoffs"
                kpi={data.kpis.handoffs}
                currency={data.currency}
                hint={`${formatPercent(data.totals.engaged ? data.totals.handoffs / data.totals.engaged : null)} of engaged conversations`}
                sparkline={data.series.map((point) => point.handoffs)}
                icon={<Handshake className="size-4" />}
                invert
              />
              <AgentKpiCard
                label="Cost / conversation"
                kpi={data.kpis.cost}
                currency={data.currency}
                hint={`Total ${formatMoney(data.totals.totalCostCents, data.currency)}`}
                sparkline={data.series.map((point) => point.costCents)}
                icon={<Wallet className="size-4" />}
                invert
              />
            </div>

            <div className="grid items-start gap-4 xl:grid-cols-[1.6fr_1fr]">
              <VolumeOutcomeChart series={data.series} />
              <AttentionPanel items={data.attention} onSelectAgent={selectAgent} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <FunnelCard funnel={data.funnel} />
              <CsatCard dashboard={data} />
            </div>

            <LeaderboardPanel rows={data.leaderboard} currency={data.currency} onSelectAgent={selectAgent} />

            <ConversationHistoryTable
              agents={agents}
              agentId={agentId}
              channel={channel}
              range={range}
              rangeLabel={activeRangeLabel}
              from={fromDate}
              to={toDate}
              onSelectAgent={selectAgent}
            />

            <div className="grid gap-4 lg:grid-cols-2">
              <TopicsPanel rows={data.topics} />
              <KnowledgeGapsPanel gaps={data.knowledgeGaps} onSelectAgent={selectAgent} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <ToolHealthPanel rows={data.tools} />
              <RecentConversationsPanel rows={data.recentConversations} onSelectAgent={selectAgent} />
            </div>

          </>
        ) : null}
      </div>
    </PageLayout>
  )
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="glass-card rounded-lg p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-8 w-20" />
            <Skeleton className="mt-4 h-8 w-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Skeleton className="h-[360px] rounded-lg" />
        <Skeleton className="h-[360px] rounded-lg" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-lg" />
        <Skeleton className="h-72 rounded-lg" />
      </div>
      <Skeleton className="h-64 rounded-lg" />
    </div>
  )
}
