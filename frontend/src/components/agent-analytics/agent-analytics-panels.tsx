import type { ReactNode } from "react"
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  Database,
  Inbox,
  MessageCircle,
  Star,
  Wrench,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Metric } from "@/components/primitives"
import { cn } from "@/lib/utils"
import type {
  AnalyticsAttentionItem,
  AnalyticsKnowledgeGap,
  AnalyticsLeaderboardRow,
  AnalyticsRecentConversation,
  AnalyticsToolRow,
  AnalyticsTopicRow,
  AgentStatus,
} from "@/lib/agents-api"
import {
  formatDuration,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRating,
  outcomeLabel,
  outcomeTone,
} from "@/lib/agent-analytics-format"
import { Sparkline } from "./agent-analytics-charts"

const TITLE = "font-heading text-sm font-semibold tracking-tight"
const HINT = "mt-0.5 text-xs text-muted-foreground"

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <Card className={cn("glass-card flex min-w-0 flex-col gap-3 rounded-lg p-5", className)}>{children}</Card>
}

function EmptyPanel({ children }: { children: ReactNode }) {
  return (
    <p className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}

function AgentStatusBadge({ status }: { status: AgentStatus }) {
  const variant = status === "active" ? "default" : status === "paused" ? "secondary" : "outline"
  return (
    <Badge variant={variant} className="capitalize">
      {status}
    </Badge>
  )
}

function OutcomeBadge({ outcome }: { outcome: string }) {
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
}

export function AttentionPanel({
  items,
  onSelectAgent,
}: {
  items: AnalyticsAttentionItem[]
  onSelectAgent?: (agentId: string) => void
}) {
  return (
    <Panel>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className={TITLE}>Needs attention</h3>
          <p className={HINT}>The things worth opening before the next conversation</p>
        </div>
        <Badge variant="outline">{items.length}</Badge>
      </div>
      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-success-border/60 bg-success-bg/30 px-4 py-8 text-center">
          <CheckCircle2 className="size-6 text-success-foreground" />
          <p className="text-sm font-medium text-success-foreground">All clear in this range</p>
          <p className="text-xs text-success-foreground/75">No failing tools, low CSAT, or stale conversations.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const content = (
              <>
                <span
                  className={cn(
                    "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
                    item.severity === "critical" && "bg-error-bg text-error-foreground",
                    item.severity === "warning" && "bg-warning-bg text-warning-foreground",
                    item.severity === "info" && "bg-muted text-muted-foreground",
                  )}
                >
                  {item.severity === "critical" ? <CircleAlert className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{item.title}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{item.detail}</span>
                  {item.agentName && <span className="mt-1 block text-[11px] text-muted-foreground/75">{item.agentName}</span>}
                </span>
                {item.agentId && <ArrowUpRight className="mt-1 size-4 shrink-0 text-muted-foreground" />}
              </>
            )
            return (
              <li key={item.id}>
                {item.agentId ? (
                  <button
                    type="button"
                    onClick={() => onSelectAgent?.(item.agentId!)}
                    className="flex w-full items-start gap-2.5 rounded-xl border border-border/60 bg-card/50 px-3 py-2.5 text-left transition hover:border-primary/30 hover:bg-primary/5"
                  >
                    {content}
                  </button>
                ) : (
                  <div className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-card/50 px-3 py-2.5">{content}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

export function LeaderboardPanel({
  rows,
  currency,
  onSelectAgent,
}: {
  rows: AnalyticsLeaderboardRow[]
  currency: string
  onSelectAgent?: (agentId: string) => void
}) {
  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className={TITLE}>Agent leaderboard</h3>
          <p className={HINT}>Compare outcomes, speed, and cost across agents</p>
        </div>
        <Badge variant="outline">{rows.length} agents</Badge>
      </div>
      {rows.length === 0 ? (
        <EmptyPanel>No agent has handled a conversation in this range.</EmptyPanel>
      ) : (
        <div className="space-y-1">
          <div className="hidden grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,0.75fr))_88px] gap-3 px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground md:grid">
            <span>Agent</span>
            <span className="text-right">Conversations</span>
            <span className="text-right">Resolved</span>
            <span className="text-right">CSAT</span>
            <span className="text-right">Cost / conv.</span>
            <span className="text-right">Trend</span>
          </div>
          {rows.map((row) => (
            <button
              key={row.agentId}
              type="button"
              onClick={() => onSelectAgent?.(row.agentId)}
              className="grid w-full grid-cols-2 items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition hover:border-border/70 hover:bg-muted/35 md:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,0.75fr))_88px]"
            >
              <div className="col-span-2 flex min-w-0 items-center gap-2 md:col-span-1">
                <span className="min-w-0 truncate text-sm font-medium">{row.agentName}</span>
                <AgentStatusBadge status={row.status} />
              </div>
              <p className="text-right text-sm tabular-nums">{formatNumber(row.conversations)}</p>
              <p className="text-right text-sm tabular-nums">
                {formatPercent(row.resolutionRate)}
                <span className="ms-1 text-[10px] text-muted-foreground">({formatNumber(row.resolved)})</span>
              </p>
              <p className="text-right text-sm tabular-nums">{formatRating(row.csat)}</p>
              <p className="text-right text-sm tabular-nums">{formatMoney(row.costPerConversationCents, currency)}</p>
              <div className="col-span-2 flex justify-end md:col-span-1">
                <Sparkline values={row.sparkline} className="h-7 w-20" />
              </div>
            </button>
          ))}
        </div>
      )}
    </Panel>
  )
}

export function TopicsPanel({ rows }: { rows: AnalyticsTopicRow[] }) {
  const max = Math.max(1, ...rows.map((row) => row.conversations))
  return (
    <Panel>
      <div>
        <h3 className={TITLE}>What customers ask</h3>
        <p className={HINT}>Topics recorded on conversations, with resolution and conversion</p>
      </div>
      {rows.length === 0 ? (
        <EmptyPanel>No topics recorded yet. Add a topic when the runtime creates a conversation.</EmptyPanel>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.topic} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium">{row.topic}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatNumber(row.conversations)} · {formatPercent(row.conversations ? row.resolved / row.conversations : null)} resolved
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary/70" style={{ width: `${(row.conversations / max) * 100}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground">
                {formatPercent(row.share)} of conversations · {formatPercent(row.conversionRate)} converted
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export function KnowledgeGapsPanel({
  gaps,
  onSelectAgent,
}: {
  gaps: AnalyticsKnowledgeGap[]
  onSelectAgent?: (agentId: string) => void
}) {
  return (
    <Panel>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className={TITLE}>Knowledge gaps</h3>
          <p className={HINT}>Questions the retriever could not answer well</p>
        </div>
        <Database className="size-4 text-muted-foreground" />
      </div>
      {gaps.length === 0 ? (
        <EmptyPanel>No unanswered knowledge searches in this range.</EmptyPanel>
      ) : (
        <ul className="space-y-2">
          {gaps.map((gap) => (
            <li key={`${gap.agentId ?? "none"}:${gap.query}`} className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-card/50 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium" title={gap.query}>
                  {gap.query}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {gap.agentName ?? "Unknown agent"} · last seen {new Date(gap.lastSeenAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="outline">{gap.count}×</Badge>
                {gap.agentId && (
                  <Button variant="ghost" size="icon" className="size-7" onClick={() => onSelectAgent?.(gap.agentId!)} aria-label={`Open ${gap.agentName ?? "agent"}`}>
                    <ArrowUpRight className="size-3.5" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export function ToolHealthPanel({ rows }: { rows: AnalyticsToolRow[] }) {
  return (
    <Panel>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className={TITLE}>Tool health</h3>
          <p className={HINT}>Calls, failures, and p95 latency from the runtime</p>
        </div>
        <Wrench className="size-4 text-muted-foreground" />
      </div>
      {rows.length === 0 ? (
        <EmptyPanel>No tool calls recorded. Instrument the runtime to see tool health here.</EmptyPanel>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.name} className="rounded-xl border border-border/60 bg-card/50 px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-medium">{row.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatNumber(row.calls)} calls · {formatPercent(row.successRate)} success
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", (row.successRate ?? 0) >= 0.95 ? "bg-primary" : "bg-warning")}
                    style={{ width: `${Math.max(2, (row.successRate ?? 0) * 100)}%` }}
                  />
                </div>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {row.failures > 0 ? `${row.failures} failed` : "no failures"} · p95 {formatDuration(row.p95Ms)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

export function RecentConversationsPanel({
  rows,
  onSelectAgent,
}: {
  rows: AnalyticsRecentConversation[]
  onSelectAgent?: (agentId: string) => void
}) {
  return (
    <Panel>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className={TITLE}>Recent conversations</h3>
          <p className={HINT}>The latest sessions in this range, with outcome and rating</p>
        </div>
        <MessageCircle className="size-4 text-muted-foreground" />
      </div>
      {rows.length === 0 ? (
        <EmptyPanel>No conversations in this range.</EmptyPanel>
      ) : (
        <ul className="divide-y divide-border/60">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onSelectAgent?.(row.agentId)}
                className="flex w-full items-center gap-3 px-1 py-2.5 text-left transition hover:bg-muted/30"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                  {row.channel === "voice" ? <MessageCircle className="size-4" /> : <Inbox className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{row.agentName}</span>
                    <OutcomeBadge outcome={row.outcome} />
                    {row.topic && <span className="truncate text-[11px] text-muted-foreground">{row.topic}</span>}
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span>{row.channel}</span>
                    <span>{row.messages} messages</span>
                    <span>{formatDuration(row.durationMs)}</span>
                    <span>{new Date(row.startedAt).toLocaleString()}</span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  {row.rating !== null ? (
                    <>
                      <Star className="size-3.5 fill-warning text-warning" />
                      {row.rating}
                    </>
                  ) : (
                    "—"
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export function SummaryMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  )
}

export function MetricInline({ children }: { children: ReactNode }) {
  return <Metric className="text-foreground">{children}</Metric>
}
