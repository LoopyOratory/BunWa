import { useMemo, useState, type ReactNode } from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card } from "@/components/ui/card"
import { Metric } from "@/components/primitives"
import type { AnalyticsData, DashboardRange } from "@/lib/api"

/*
 * Charts for the analytics page. Series colours are the --series-* tokens
 * (validated as a set for colour-vision separation in light and dark); every
 * chart has a legend, a hover tooltip and a "View as table" fallback, so no
 * value is told by colour alone.
 */

const TICK = { fontSize: 11, fill: "var(--muted-foreground)" } as const
const GRID = { vertical: false, stroke: "var(--border)", strokeOpacity: 0.55, strokeDasharray: "3 6" } as const
// A 2px surface gap between stacked segments and adjacent bars.
const GAP = { stroke: "var(--card)", strokeWidth: 2 } as const

const SERIES = {
  sent: { label: "Sent", color: "var(--series-sent)" },
  refused: { label: "Refused by limits", color: "var(--series-refused)" },
  failed: { label: "Failed", color: "var(--series-failed)" },
  delivered: { label: "Delivered", color: "var(--series-sent)" },
  webhookFailed: { label: "Failed", color: "var(--series-failed)" },
  messageRate: { label: "Messages", color: "var(--series-sent)" },
  webhookRate: { label: "Webhooks", color: "var(--series-webhook)" },
} as const

type SeriesKey = keyof typeof SERIES

function bucketLabel(ms: number, range: DashboardRange): string {
  const d = new Date(ms)
  if (range === "1h" || range === "24h") {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }
  if (range === "7d") {
    return `${d.toLocaleDateString([], { weekday: "short" })} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" })
}

type TipItem = { name?: string; value?: number | string; color?: string; dataKey?: string }

function ChartTooltip({
  active,
  payload,
  label,
  unit = "",
  showTotal = true,
}: {
  active?: boolean
  payload?: TipItem[]
  label?: string
  unit?: string
  showTotal?: boolean
}) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((n, p) => n + (typeof p.value === "number" ? p.value : 0), 0)
  return (
    <div className="surface-overlay rounded-lg px-3 py-2 text-xs">
      {label && <p className="mb-1 font-semibold text-foreground">{label}</p>}
      {payload.map((p) => (
        <p key={p.dataKey ?? p.name} className="flex items-center gap-1.5 text-muted-foreground">
          <span className="filter-dot" style={{ background: p.color }} />
          {p.name}
          <span className="ms-auto ps-3 font-semibold tabular-nums text-foreground">
            {p.value === null || p.value === undefined ? "no data" : `${p.value}${unit}`}
          </span>
        </p>
      ))}
      {showTotal && payload.length > 1 && (
        <p className="mt-1 flex border-t border-border/60 pt-1 text-muted-foreground">
          Total<span className="ms-auto ps-3 font-semibold tabular-nums text-foreground">{total}</span>
        </p>
      )}
    </div>
  )
}

function Legend({ keys }: { keys: SeriesKey[] }) {
  if (keys.length < 2) return null
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
      {keys.map((key) => (
        <li key={key} className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: SERIES[key].color }} />
          {SERIES[key].label}
        </li>
      ))}
    </ul>
  )
}

export interface TableView {
  columns: string[]
  rows: Array<Array<string | number>>
}

/** One chart card: title, hint, legend, the plot, and a table view of the same numbers. */
export function ChartCard({
  title,
  hint,
  legend = [],
  table,
  empty,
  className,
  children,
}: {
  title: string
  hint?: ReactNode
  legend?: SeriesKey[]
  table?: TableView
  /** Shown instead of the plot when there is nothing to draw. */
  empty?: string | null
  className?: string
  children: ReactNode
}) {
  const [showTable, setShowTable] = useState(false)
  return (
    <Card className={`flex min-w-0 flex-col gap-3 p-5 ${className ?? ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-heading text-sm font-semibold tracking-tight">{title}</h3>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {table && !empty && (
          <button
            type="button"
            className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            aria-pressed={showTable}
            onClick={() => setShowTable((v) => !v)}
          >
            {showTable ? "View as chart" : "View as table"}
          </button>
        )}
      </div>
      {!empty && <Legend keys={legend} />}
      {empty ? (
        <p className="flex min-h-[180px] items-center justify-center rounded-lg border border-dashed border-border/70 px-4 text-center text-sm text-muted-foreground">
          {empty}
        </p>
      ) : showTable && table ? (
        <div className="max-h-[260px] overflow-auto rounded-md border border-border/60">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
              <tr>
                {table.columns.map((c, i) => (
                  <th key={c} className={`px-3 py-2 font-semibold text-muted-foreground ${i === 0 ? "text-left" : "text-right"}`}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={r} className="border-t border-border/40">
                  {row.map((cell, i) => (
                    <td key={i} className={`px-3 py-1.5 ${i === 0 ? "text-left" : "text-right tabular-nums"}`}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </Card>
  )
}

/* ── Messages over time: smooth stacked areas (sent / refused / failed) ── */
function AreaGradient({ id, color }: { id: string; color: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity={0.55} />
      <stop offset="100%" stopColor={color} stopOpacity={0.04} />
    </linearGradient>
  )
}

export function MessagesOverTime({ data }: { data: AnalyticsData }) {
  const rows = useMemo(
    () =>
      data.series.bucketStart.map((start, i) => {
        const refused = data.series.refused[i] ?? 0
        return {
          label: bucketLabel(start, data.range.key),
          sent: data.series.sent[i] ?? 0,
          refused,
          failed: Math.max(0, (data.series.failed[i] ?? 0) - refused),
        }
      }),
    [data],
  )
  const total = data.totals.sent + data.totals.failed
  const keys = ["sent", "refused", "failed"] as const
  return (
    <ChartCard
      title="Messages over time"
      hint="Outgoing messages per interval (REST, bulk and MCP), stacked"
      legend={[...keys]}
      empty={total === 0 ? "No messages were sent in this range." : null}
      table={{ columns: ["Time", "Sent", "Refused", "Failed"], rows: rows.map((r) => [r.label, r.sent, r.refused, r.failed]) }}
      className="lg:col-span-2"
    >
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <defs>
              {keys.map((key) => (
                <AreaGradient key={key} id={`area-${key}`} color={SERIES[key].color} />
              ))}
            </defs>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={TICK} interval="preserveStartEnd" minTickGap={24} />
            <YAxis width={34} allowDecimals={false} tickLine={false} axisLine={false} tick={TICK} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} />
            {keys.map((key) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                name={SERIES[key].label}
                stackId="m"
                stroke={SERIES[key].color}
                strokeWidth={2}
                fill={`url(#area-${key})`}
                activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}

/* ── Success rate over time: messages vs webhooks, one % axis ──────────── */
export function SuccessRateTrend({ data }: { data: AnalyticsData }) {
  const rate = (ok: number, bad: number) => (ok + bad > 0 ? Math.round((ok / (ok + bad)) * 1000) / 10 : null)
  const rows = useMemo(
    () =>
      data.series.bucketStart.map((start, i) => ({
        label: bucketLabel(start, data.range.key),
        messageRate: rate(data.series.sent[i] ?? 0, data.series.failed[i] ?? 0),
        webhookRate: rate(data.series.webhookDelivered[i] ?? 0, data.series.webhookFailed[i] ?? 0),
      })),
    [data],
  )
  const hasData = rows.some((r) => r.messageRate !== null || r.webhookRate !== null)
  const cell = (v: number | null) => (v === null ? "-" : `${v}%`)
  return (
    <ChartCard
      title="Success rate over time"
      hint="Share of messages sent and webhooks delivered per interval; gaps mean no traffic"
      legend={["messageRate", "webhookRate"]}
      empty={hasData ? null : "No traffic in this range."}
      table={{ columns: ["Time", "Messages", "Webhooks"], rows: rows.map((r) => [r.label, cell(r.messageRate), cell(r.webhookRate)]) }}
    >
      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={TICK} interval="preserveStartEnd" minTickGap={24} />
            <YAxis width={40} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} tick={TICK} />
            <Tooltip content={<ChartTooltip unit="%" showTotal={false} />} cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} />
            {(["messageRate", "webhookRate"] as const).map((key) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={SERIES[key].label}
                stroke={SERIES[key].color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}

/* ── Webhook deliveries over time ─────────────────────────────────────── */
export function WebhooksOverTime({ data }: { data: AnalyticsData }) {
  const rows = useMemo(
    () =>
      data.series.bucketStart.map((start, i) => ({
        label: bucketLabel(start, data.range.key),
        delivered: data.series.webhookDelivered[i] ?? 0,
        webhookFailed: data.series.webhookFailed[i] ?? 0,
      })),
    [data],
  )
  const total = data.totals.webhookDelivered + data.totals.webhookFailed
  return (
    <ChartCard
      title="Webhook deliveries"
      hint="Per interval, after retries"
      legend={["delivered", "webhookFailed"]}
      empty={total === 0 ? "No webhook deliveries in this range." : null}
      table={{ columns: ["Time", "Delivered", "Failed"], rows: rows.map((r) => [r.label, r.delivered, r.webhookFailed]) }}
    >
      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }} barCategoryGap="20%">
            <CartesianGrid {...GRID} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={TICK} interval="preserveStartEnd" minTickGap={24} />
            <YAxis width={34} allowDecimals={false} tickLine={false} axisLine={false} tick={TICK} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--primary)", fillOpacity: 0.06 }} />
            <Bar dataKey="delivered" name={SERIES.delivered.label} stackId="w" fill={SERIES.delivered.color} {...GAP} maxBarSize={16} />
            <Bar dataKey="webhookFailed" name={SERIES.webhookFailed.label} stackId="w" fill={SERIES.webhookFailed.color} {...GAP} maxBarSize={16} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}

/** Horizontal stacked bars for a ranked breakdown (sessions, features). */
function RankedBars({
  rows,
  height,
}: {
  rows: Array<{ name: string; sent: number; refused: number; failed: number }>
  height: number
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} barCategoryGap="22%">
          <CartesianGrid horizontal={false} stroke="var(--border)" strokeOpacity={0.55} strokeDasharray="3 6" />
          <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={TICK} />
          <YAxis type="category" dataKey="name" width={130} tickLine={false} axisLine={false} tick={TICK} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--primary)", fillOpacity: 0.06 }} />
          <Bar dataKey="sent" name={SERIES.sent.label} stackId="r" fill={SERIES.sent.color} {...GAP} maxBarSize={18} />
          <Bar dataKey="refused" name={SERIES.refused.label} stackId="r" fill={SERIES.refused.color} {...GAP} maxBarSize={18} />
          <Bar dataKey="failed" name={SERIES.failed.label} stackId="r" fill={SERIES.failed.color} {...GAP} maxBarSize={18} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

const rankedHeight = (n: number) => Math.max(120, n * 34 + 30)

/* ── Sessions compared: grouped bars per session ───────────────────────── */
export function SessionsCompared({ data }: { data: AnalyticsData }) {
  const rows = data.perSession.slice(0, 10).map((s) => ({
    name: s.session,
    sent: s.sent,
    refused: s.refused,
    failed: Math.max(0, s.failed - s.refused),
  }))
  return (
    <ChartCard
      title="Messages by session"
      hint={data.perSession.length > 10 ? "Top 10 sessions by volume" : "Sent, refused and failed side by side"}
      legend={["sent", "refused", "failed"]}
      empty={rows.length === 0 ? "No session sent anything in this range." : null}
      table={{
        columns: ["Session", "Sent", "Refused", "Failed", "Webhooks ok", "Webhooks failed"],
        rows: data.perSession.map((s) => [s.session, s.sent, s.refused, s.failed - s.refused, s.webhookDelivered, s.webhookFailed]),
      }}
    >
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }} barCategoryGap="24%" barGap={2}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="name" tickLine={false} axisLine={false} tick={TICK} interval={0} />
            <YAxis width={34} allowDecimals={false} tickLine={false} axisLine={false} tick={TICK} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--primary)", fillOpacity: 0.06 }} />
            {(["sent", "refused", "failed"] as const).map((key) => (
              <Bar key={key} dataKey={key} name={SERIES[key].label} fill={SERIES[key].color} maxBarSize={22} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}

/* ── Feature usage: which send types (REST actions, MCP tools) are used ── */
export function FeatureUsage({ data }: { data: AnalyticsData }) {
  const label = (f: AnalyticsData["features"][number]) => `${f.feature}${f.channel === "mcp" ? " (MCP)" : ""}`
  const rows = data.features.slice(0, 12).map((f) => ({
    name: label(f),
    sent: f.sent,
    refused: f.refused,
    failed: Math.max(0, f.failed - f.refused),
  }))
  return (
    <ChartCard
      title="Features used"
      hint="Sends by type: REST endpoint or MCP tool"
      legend={["sent", "refused", "failed"]}
      empty={rows.length === 0 ? "No sends in this range." : null}
      table={{
        columns: ["Feature", "Channel", "Sent", "Refused", "Failed"],
        rows: data.features.map((f) => [f.feature, f.channel === "mcp" ? "MCP" : "REST", f.sent, f.refused, f.failed - f.refused]),
      }}
    >
      <RankedBars rows={rows} height={rankedHeight(rows.length)} />
    </ChartCard>
  )
}

/* ── Failure reasons ───────────────────────────────────────────────────── */
export function FailureReasons({ data }: { data: AnalyticsData }) {
  const rows = data.failureReasons.map((r) => ({ name: r.reason, count: r.count }))
  return (
    <ChartCard
      title="Why sends failed"
      hint="Failed and refused sends, grouped by cause"
      empty={rows.length === 0 ? "No failed sends in this range." : null}
      table={{
        columns: ["Reason", "Count", "Last seen", "Session"],
        rows: data.failureReasons.map((r) => [r.reason, r.count, new Date(r.lastAt).toLocaleString(), r.session ?? "-"]),
      }}
    >
      <div style={{ height: rankedHeight(rows.length) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} barCategoryGap="22%">
            <CartesianGrid horizontal={false} stroke="var(--border)" strokeOpacity={0.55} strokeDasharray="3 6" />
            <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={TICK} />
            <YAxis type="category" dataKey="name" width={170} tickLine={false} axisLine={false} tick={TICK} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--primary)", fillOpacity: 0.06 }} />
            <Bar dataKey="count" name="Failures" fill={SERIES.failed.color} maxBarSize={18} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}

/* ── Activity by hour of day ───────────────────────────────────────────── */
export function ActivityByHour({ data }: { data: AnalyticsData }) {
  const rows = data.byHour.sent.map((sent, hour) => ({
    label: `${String(hour).padStart(2, "0")}:00`,
    sent,
    failed: data.byHour.failed[hour] ?? 0,
  }))
  const total = rows.reduce((n, r) => n + r.sent + r.failed, 0)
  const busiest = total > 0 ? rows.reduce((best, r) => (r.sent + r.failed > best.sent + best.failed ? r : best), rows[0]) : null
  return (
    <ChartCard
      title="Activity by hour of day"
      hint={busiest ? <>Server time · busiest at <Metric>{busiest.label}</Metric></> : "Server time"}
      legend={["sent", "failed"]}
      empty={total === 0 ? "No sends in this range." : null}
      table={{ columns: ["Hour", "Sent", "Failed"], rows: rows.map((r) => [r.label, r.sent, r.failed]) }}
    >
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }} barCategoryGap="18%">
            <CartesianGrid {...GRID} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={TICK} interval={2} />
            <YAxis width={34} allowDecimals={false} tickLine={false} axisLine={false} tick={TICK} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--primary)", fillOpacity: 0.06 }} />
            <Bar dataKey="sent" name={SERIES.sent.label} stackId="h" fill={SERIES.sent.color} {...GAP} maxBarSize={18} />
            <Bar dataKey="failed" name={SERIES.failed.label} stackId="h" fill={SERIES.failed.color} {...GAP} maxBarSize={18} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
