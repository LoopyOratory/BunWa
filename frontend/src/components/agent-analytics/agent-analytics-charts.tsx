import type { ReactNode } from "react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { AgentAnalyticsDashboard, AnalyticsFunnel, AnalyticsKpi, AnalyticsSeriesPoint } from "@/lib/agents-api"
import {
  deltaLabel,
  deltaTone,
  formatNumber,
  formatPercent,
  formatRating,
  formatValue,
} from "@/lib/agent-analytics-format"

const TICK = { fontSize: 11, fill: "var(--muted-foreground)" } as const
const GRID = { vertical: false, stroke: "var(--border)", strokeOpacity: 0.55, strokeDasharray: "3 6" } as const

export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const safe = values.length ? values : [0, 0]
  const max = Math.max(1, ...safe)
  const width = 112
  const height = 34
  const step = safe.length > 1 ? width / (safe.length - 1) : width
  const points = safe
    .map((value, index) => {
      const x = index * step
      const y = height - 3 - (Math.max(0, value) / max) * (height - 6)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${width} ${height}`}
      className={cn("h-9 w-28 overflow-visible", className)}
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={max > 0 ? 0.9 : 0.25}
      />
    </svg>
  )
}

export function AgentKpiCard({
  label,
  kpi,
  currency,
  hint,
  sparkline,
  icon,
  invert = false,
}: {
  label: string
  kpi: AnalyticsKpi
  currency: string
  hint: ReactNode
  sparkline: number[]
  icon?: ReactNode
  /** Lower is better: handoffs, first response, cost. */
  invert?: boolean
}) {
  const tone = deltaTone(kpi, invert)
  return (
    <div className="glass-card flex min-w-0 flex-col rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
          <p className="metric mt-1.5 font-heading text-3xl font-semibold leading-none tracking-tight">
            {formatValue(kpi.value, kpi.unit, currency)}
          </p>
        </div>
        {icon && <span className="icon-chip size-9 shrink-0 text-primary">{icon}</span>}
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] leading-4 text-muted-foreground">{hint}</p>
          <span
            className={cn(
              "mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
              tone === "up" && "bg-success-bg text-success-foreground",
              tone === "down" && "bg-error-bg text-error-foreground",
              tone === "flat" && "bg-muted text-muted-foreground",
            )}
          >
            {deltaLabel(kpi, currency)}
          </span>
        </div>
        <Sparkline values={sparkline} className="shrink-0" />
      </div>
    </div>
  )
}

type TooltipItem = { name?: string; value?: number; color?: string; dataKey?: string }

function VolumeTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipItem[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="surface-overlay rounded-lg px-3 py-2 text-xs">
      {label && <p className="mb-1 font-semibold text-foreground">{label}</p>}
      {payload.map((item) => (
        <p key={item.dataKey ?? item.name} className="flex items-center gap-1.5 text-muted-foreground">
          <span className="filter-dot" style={{ background: item.color }} />
          {item.name}
          <span className="ms-auto ps-3 font-semibold tabular-nums text-foreground">{formatNumber(item.value ?? 0)}</span>
        </p>
      ))}
    </div>
  )
}

const VOLUME_SERIES = [
  { key: "started", label: "Started", color: "var(--series-sent)" },
  { key: "resolved", label: "Resolved", color: "var(--series-webhook)" },
  { key: "converted", label: "Converted", color: "var(--series-refused)" },
] as const

export function VolumeOutcomeChart({ series }: { series: AnalyticsSeriesPoint[] }) {
  const total = series.reduce((sum, point) => sum + point.started + point.resolved + point.converted, 0)
  return (
    <Card className="glass-card flex min-w-0 flex-col gap-3 rounded-lg p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-sm font-semibold tracking-tight">Volume and outcomes</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Conversations started, resolved and converted</p>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
          {VOLUME_SERIES.map((item) => (
            <li key={item.key} className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-sm" style={{ background: item.color }} />
              {item.label}
            </li>
          ))}
        </ul>
      </div>
      {total === 0 ? (
        <p className="flex h-[280px] items-center justify-center rounded-lg border border-dashed border-border/70 text-sm text-muted-foreground">
          No conversations in this range yet.
        </p>
      ) : (
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="agent-started" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--series-sent)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--series-sent)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="agent-resolved" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--series-webhook)" stopOpacity={0.16} />
                  <stop offset="100%" stopColor="var(--series-webhook)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={TICK} interval="preserveStartEnd" minTickGap={24} />
              <YAxis width={30} allowDecimals={false} tickLine={false} axisLine={false} tick={TICK} />
              <Tooltip content={<VolumeTooltip />} cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} />
              <Area
                type="monotone"
                dataKey="started"
                name="Started"
                stroke="var(--series-sent)"
                strokeWidth={2}
                fill="url(#agent-started)"
                dot={false}
                activeDot={{ r: 3 }}
              />
              <Area
                type="monotone"
                dataKey="resolved"
                name="Resolved"
                stroke="var(--series-webhook)"
                strokeWidth={2}
                fill="url(#agent-resolved)"
                dot={false}
                activeDot={{ r: 3 }}
              />
              <Area
                type="monotone"
                dataKey="converted"
                name="Converted"
                stroke="var(--series-refused)"
                strokeWidth={2}
                fill="transparent"
                dot={false}
                activeDot={{ r: 3 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

const FUNNEL_STAGES: Array<{ key: keyof AnalyticsFunnel; label: string }> = [
  { key: "started", label: "Started" },
  { key: "engaged", label: "Engaged" },
  { key: "qualified", label: "Qualified" },
  { key: "resolved", label: "Resolved" },
  { key: "converted", label: "Converted" },
]

export function FunnelCard({ funnel }: { funnel: AnalyticsFunnel }) {
  const started = funnel.started
  return (
    <Card className="glass-card flex min-w-0 flex-col gap-3 rounded-lg p-5">
      <div>
        <h3 className="font-heading text-sm font-semibold tracking-tight">Conversation funnel</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">Where conversations move forward, and where they stop</p>
      </div>
      {started === 0 ? (
        <p className="rounded-lg border border-dashed border-border/70 p-5 text-sm text-muted-foreground">
          The funnel fills in after the first conversation.
        </p>
      ) : (
        <div className="space-y-3">
          {FUNNEL_STAGES.map((stage, index) => {
            const value = funnel[stage.key]
            const previous = index === 0 ? value : funnel[FUNNEL_STAGES[index - 1].key]
            const width = started ? Math.max(3, (value / started) * 100) : 0
            const conversion = previous > 0 ? value / previous : null
            return (
              <div key={stage.key} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="font-medium text-foreground">{stage.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatNumber(value)}
                    {index > 0 && <span className="ms-2 text-[10px]">{formatPercent(conversion)} of previous</span>}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500"
                    style={{ width: `${width}%`, opacity: 1 - index * 0.12 }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

export function CsatCard({ dashboard }: { dashboard: AgentAnalyticsDashboard }) {
  const distribution = dashboard.csatDistribution ?? [0, 0, 0, 0, 0]
  const reviews = dashboard.totals.reviews
  const max = Math.max(1, ...distribution)
  const average = dashboard.totals.averageRating
  const responseRate = dashboard.totals.reviewResponseRate
  return (
    <Card className="glass-card flex min-w-0 flex-col gap-3 rounded-lg p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-heading text-sm font-semibold tracking-tight">Customer satisfaction</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Review ratings submitted after a conversation</p>
        </div>
        <div className="text-right">
          <p className="font-heading text-2xl font-semibold leading-none">{formatRating(average)}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {reviews} review{reviews === 1 ? "" : "s"} · {formatPercent(responseRate)} response
          </p>
        </div>
      </div>
      {reviews === 0 ? (
        <p className="rounded-lg border border-dashed border-border/70 p-5 text-sm text-muted-foreground">
          No reviews in this range. Enable the review prompt to start collecting CSAT.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex h-32 items-end gap-2" aria-label="Rating distribution">
            {distribution.map((count, index) => (
              <div key={index} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <span className="text-[10px] tabular-nums text-muted-foreground">{count}</span>
                <div className="flex h-24 w-full items-end rounded-md bg-muted/60">
                  <div
                    className="w-full rounded-md bg-primary transition-[height] duration-500"
                    style={{ height: count === 0 ? "0%" : `${Math.max(4, (count / max) * 100)}%`, opacity: 0.45 + index * 0.1 }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">{index + 1}★</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {formatPercent(responseRate)} of review requests were answered. Read the comments before changing the prompt.
          </p>
        </div>
      )}
    </Card>
  )
}
