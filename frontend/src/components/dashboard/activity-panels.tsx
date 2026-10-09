import { useMemo } from "react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card } from "@/components/ui/card"
import { Metric } from "@/components/primitives"
import type { DashboardRange, DashboardSummary } from "@/lib/api"
import { timeAgo } from "@/lib/time"

const TICK = { fontSize: 11, fill: "var(--muted-foreground)" } as const
const TITLE = "font-heading text-sm font-semibold tracking-tight"
const HINT = "mt-0.5 text-xs text-muted-foreground"

function bucketLabel(ms: number, range: DashboardRange): string {
  const d = new Date(ms)
  if (range === "1h" || range === "24h") {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }
  if (range === "7d") {
    return `${d.toLocaleDateString([], { weekday: "short" })} ${d.toLocaleTimeString([], { hour: "2-digit" })}`
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" })
}

type TipItem = { name?: string; value?: number | string; color?: string }

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TipItem[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="surface-overlay rounded-lg px-3 py-2 text-xs">
      {label && <p className="mb-1 font-semibold text-foreground">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-1.5 text-muted-foreground">
          <span className="filter-dot" style={{ background: p.color }} />
          {p.name}
          <span className="ms-auto ps-3 font-semibold tabular-nums text-foreground">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

function MessagesPanel({ summary }: { summary: DashboardSummary }) {
  const rows = useMemo(
    () =>
      summary.series.bucketStart.map((start, i) => ({
        label: bucketLabel(start, summary.range.key),
        sent: summary.series.sent[i] ?? 0,
        failed: summary.series.failed[i] ?? 0,
      })),
    [summary],
  )
  const { sent, failed } = summary.totals
  const total = sent + failed
  return (
    <Card className="flex flex-col gap-3 p-5 lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className={TITLE}>Messages</p>
          <p className={HINT}>Outgoing messages, sent vs failed</p>
        </div>
        <p className="text-xs text-muted-foreground">
          <Metric className="text-foreground">{sent}</Metric> sent ·{" "}
          <Metric className="text-foreground">{failed}</Metric> failed
          {total > 0 && (
            <>
              {" "}· <Metric className="text-foreground">{Math.round((failed / total) * 100)}%</Metric> fail rate
            </>
          )}
        </p>
      </div>
      {total === 0 ? (
        <p className="flex h-[180px] items-center justify-center rounded-lg border border-dashed border-border/70 text-sm text-muted-foreground">
          No messages in this range.
        </p>
      ) : (
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }} barCategoryGap="25%">
              <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.55} strokeDasharray="3 6" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={TICK} interval="preserveStartEnd" minTickGap={24} />
              <YAxis width={30} allowDecimals={false} tickLine={false} axisLine={false} tick={TICK} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--primary)", fillOpacity: 0.06 }} />
              <Bar dataKey="sent" name="Sent" stackId="m" fill="var(--success)" maxBarSize={12} />
              <Bar dataKey="failed" name="Failed" stackId="m" fill="var(--error)" maxBarSize={12} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

function FailuresPanel({ summary, now }: { summary: DashboardSummary; now: number }) {
  const reasons = summary.failureReasons
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div>
        <p className={TITLE}>Failures by reason</p>
        <p className={HINT}>Failed and policy-refused sends</p>
      </div>
      {reasons.length === 0 ? (
        <p className="text-sm text-muted-foreground">No failed sends in this range.</p>
      ) : (
        <ul className="space-y-2">
          {reasons.slice(0, 6).map((r) => (
            <li key={r.reason} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate" title={r.example ?? undefined}>{r.reason}</span>
                <Metric className="font-semibold">{r.count}</Metric>
              </div>
              <p className="text-xs text-muted-foreground">
                last {timeAgo(r.lastAt, now)}{r.session ? ` · ${r.session}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function WebhooksPanel({ summary, now }: { summary: DashboardSummary; now: number }) {
  const { delivered, failed, failing } = summary.webhooks
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div>
        <p className={TITLE}>Webhooks</p>
        <p className={HINT}>Deliveries in this range</p>
      </div>
      <p className="text-sm">
        <Metric className="font-semibold">{delivered}</Metric> delivered
        {failed > 0 && (
          <span className="text-error-foreground"> · <Metric className="font-semibold">{failed}</Metric> failed</span>
        )}
      </p>
      {failing.length > 0 && (
        <ul className="space-y-2 border-t border-border/50 pt-2">
          {failing.slice(0, 5).map((hook) => (
            <li key={`${hook.session}:${hook.url}`} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate font-mono text-xs" title={hook.url ?? undefined}>{hook.url ?? "unknown URL"}</span>
                <Metric className="font-semibold text-error-foreground">{hook.count}</Metric>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {hook.session ?? "no session"}{hook.lastError ? ` · ${hook.lastError}` : ""} · {timeAgo(hook.lastAt, now)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function ActivityPanels({ summary, now }: { summary: DashboardSummary; now: number }) {
  return (
    <div className="grid gap-4 lg:grid-cols-4">
      <MessagesPanel summary={summary} />
      <FailuresPanel summary={summary} now={now} />
      <WebhooksPanel summary={summary} now={now} />
    </div>
  )
}
