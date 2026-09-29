/**
 * Dashboard charts — the metrics an operator actually watches, each one
 * computed only from real API data (sessions, workers, audit log):
 *
 *   SessionsDonut        status mix of the sessions the filters let through
 *   MessagesChart        send volume: delivered vs failed, per hour/day
 *   SessionActivityChart session lifecycle events (created/started/stopped/QR)
 *   IssuesChart          warn+error audit events grouped by cause
 *   WorkersLoad          sessions handled by each worker
 *
 * All time series share one bucketing helper so the range chips reshape
 * every chart at once. Buckets are hourly for 24h and daily for 7d/30d.
 */
import { useMemo } from "react"
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
  LabelList,
} from "recharts"
import { Card } from "@/components/ui/card"
import type { AuditEntry, Session, Worker } from "@/lib/api"

/* ── Status language, defined once and reused by chips + charts ──────── */
export const STATUS_META: Record<string, { label: string; color: string }> = {
  WORKING: { label: "Working", color: "var(--success)" },
  STARTING: { label: "Starting", color: "var(--warning)" },
  SCAN_QR_CODE: { label: "Scan QR", color: "var(--info)" },
  FAILED: { label: "Failed", color: "var(--error)" },
  STOPPED: { label: "Stopped", color: "oklch(0.72 0.03 320)" },
}

export const STATUS_ORDER = ["WORKING", "STARTING", "SCAN_QR_CODE", "FAILED", "STOPPED"] as const

const OFFLINE_COLOR = "oklch(0.72 0.03 320)"
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function fmtDay(t: number) {
  const d = new Date(t)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/* ── Issue classification, shared by the chart and the KPI cards ─────── */

export const isIssue = (e: AuditEntry) => e.severity === "warn" || e.severity === "error"

const ISSUE_CATEGORY: Record<string, string> = {
  message_failed: "Messages",
  webhook_failed: "Webhooks",
  api_key_auth_failed: "Auth",
  session_disconnected: "Sessions",
  session_force_killed: "Sessions",
  session_stopped: "Sessions",
}

/** Category for a warn/error entry, or null when it is not an issue. */
export function issueCategoryOf(e: AuditEntry): string | null {
  if (!isIssue(e)) return null
  return ISSUE_CATEGORY[e.action] ?? "Other"
}

const ISSUE_SERIES = [
  { key: "Messages", color: "var(--error)" },
  { key: "Webhooks", color: "var(--warning)" },
  { key: "Auth", color: "var(--info)" },
  { key: "Sessions", color: "var(--primary)" },
  { key: "Other", color: OFFLINE_COLOR },
] as const

const ACTIVITY_SERIES = [
  { key: "Created", color: "var(--chart-3)" },
  { key: "Started", color: "var(--success)" },
  { key: "Stopped", color: OFFLINE_COLOR },
  { key: "QR", color: "var(--info)" },
] as const

const ACTIVITY_CATEGORY: Record<string, string> = {
  session_created: "Created",
  session_started: "Started",
  session_connected: "Started",
  session_stopped: "Stopped",
  session_disconnected: "Stopped",
  session_force_killed: "Stopped",
  session_deleted: "Stopped",
  session_qr_generated: "QR",
}

const MESSAGE_SERIES = [
  { label: "Delivered", color: "var(--success)" },
  { label: "Failed", color: "var(--error)" },
] as const

/* ── Shared bits ─────────────────────────────────────────────────────── */

type TipItem = { name?: string; value?: number | string; color?: string }

function GlassTooltip({ active, payload, label }: { active?: boolean; payload?: TipItem[]; label?: string | number }) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="glass-pop rounded-xl px-3 py-2 text-xs">
      {label !== undefined && label !== "" && (
        <p className="mb-1 font-heading font-semibold tracking-tight text-foreground">{label}</p>
      )}
      <div className="space-y-0.5">
        {payload.map((p, i) => (
          <p key={`${p.name ?? "v"}-${i}`} className="flex items-center gap-1.5 text-muted-foreground">
            <span className="filter-dot" style={{ background: p.color }} />
            <span>{p.name}</span>
            <span className="ml-auto ps-3 font-semibold tabular-nums text-foreground">{p.value}</span>
          </p>
        ))}
      </div>
    </div>
  )
}

function ChartEmpty({ text }: { text: string }) {
  return (
    <div className="flex h-[210px] items-center justify-center rounded-xl border border-dashed border-border/70 bg-card/30 px-6 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  )
}

function ChartLegend({ items }: { items: ReadonlyArray<{ label: string; color: string }> }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="filter-dot" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  )
}

const CARD_HEAD = "flex flex-wrap items-start justify-between gap-3"
const CHART_TITLE = "font-heading text-sm font-semibold tracking-tight"
const CHART_HINT = "mt-0.5 text-xs text-muted-foreground"

const TICK = { fontSize: 11, fill: "var(--muted-foreground)" } as const
const BAR_MARGIN = { top: 6, right: 8, bottom: 0, left: 0 }

/** Bucket audit entries between two timestamps picked in the range control.
 *  Hourly buckets for spans up to two days, daily buckets beyond; `add`
 *  returns true only when it classified the entry, so `hit` is this chart's
 *  own total, never the global event count. */
function bucketize<T>(
  entries: AuditEntry[],
  from: number,
  to: number,
  makeRow: (label: string) => T,
  add: (row: T, e: AuditEntry) => boolean,
): { rows: T[]; perHour: boolean; hit: number } {
  const hourMs = 3_600_000
  const dayMs = 86_400_000
  const spanMs = Math.max(hourMs, to - from)
  const perHour = spanMs <= 48 * hourMs
  const step = perHour ? hourMs : dayMs
  const count = Math.max(1, Math.min(130, Math.ceil(spanMs / step)))
  const start = from
  const multiDay = count > 24
  const label = (t: number) => {
    if (!perHour) return fmtDay(t)
    const d = new Date(t)
    const hh = `${String(d.getHours()).padStart(2, "0")}:00`
    return multiDay ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${hh}` : hh
  }
  const rows = Array.from({ length: count }, (_, i) => makeRow(label(start + i * step)))
  let hit = 0
  for (const e of entries) {
    const t = Date.parse(e.createdAt)
    if (Number.isNaN(t) || t < start || t > to) continue
    const idx = Math.min(count - 1, Math.max(0, Math.floor((t - start) / step)))
    if (add(rows[idx], e)) hit++
  }
  return { rows, perHour, hit }
}

function TimeXAxis({ perHour, count }: { perHour: boolean; count: number }) {
  return (
    <XAxis
      dataKey="label"
      tickLine={false}
      axisLine={false}
      tick={TICK}
      interval={perHour ? 3 : Math.max(0, Math.floor(count / 10) - 1)}
      minTickGap={16}
    />
  )
}

/* ── 1. Sessions by status ───────────────────────────────────────────── */

export function SessionsDonut({ sessions }: { sessions: Session[] }) {
  const slices = useMemo(() => {
    const counts = new Map<string, number>()
    for (const s of sessions) counts.set(s.status, (counts.get(s.status) ?? 0) + 1)
    return STATUS_ORDER.filter((k) => (counts.get(k) ?? 0) > 0).map((k) => ({
      key: k as string,
      name: STATUS_META[k].label,
      value: counts.get(k) ?? 0,
      color: STATUS_META[k].color,
    }))
  }, [sessions])

  const total = sessions.length

  return (
    <Card className="hover-float flex flex-col gap-4 p-5">
      <div className={CARD_HEAD}>
        <div>
          <p className={CHART_TITLE}>Sessions by status</p>
          <p className={CHART_HINT}>Status mix of the sessions in view</p>
        </div>
      </div>
      {total === 0 ? (
        <ChartEmpty text="No sessions to chart yet." />
      ) : slices.length === 0 ? (
        <ChartEmpty text="Every status is filtered out right now." />
      ) : (
        <>
          <div className="relative h-[215px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<GlassTooltip />} />
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="64%"
                  outerRadius="90%"
                  paddingAngle={3}
                  cornerRadius={7}
                  stroke="none"
                  startAngle={90}
                  endAngle={-270}
                >
                  {slices.map((s) => (
                    <Cell key={s.key} fill={s.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="metric font-heading text-4xl font-semibold leading-none">{total}</span>
              <span className="mt-1 text-xs text-muted-foreground">{total === 1 ? "session" : "sessions"}</span>
            </div>
          </div>
          <ul className="grid grid-cols-2 gap-x-5 gap-y-1.5">
            {slices.map((s) => (
              <li key={s.key} className="flex items-center gap-2 text-xs">
                <span className="filter-dot" style={{ background: s.color }} />
                <span className="text-muted-foreground">{s.name}</span>
                <span className="ml-auto font-semibold tabular-nums text-foreground">{s.value}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}

/* ── 2. Messages: delivered vs failed ────────────────────────────────── */

export function MessagesChart({ entries, from, to, failed }: { entries: AuditEntry[]; from: number; to: number; failed?: boolean }) {
  const { rows, perHour, sent, fail } = useMemo(() => {
    let sentCount = 0
    let failCount = 0
    const b = bucketize(
      entries,
      from,
      to,
      (label) => ({ label, delivered: 0, failed: 0 }),
      (row, e) => {
        if (e.action === "message_sent") {
          row.delivered++
          sentCount++
          return true
        }
        if (e.action === "message_failed") {
          row.failed++
          failCount++
          return true
        }
        return false
      },
    )
    return { rows: b.rows, perHour: b.perHour, sent: sentCount, fail: failCount }
  }, [entries, from, to])

  const total = sent + fail
  const rate = total > 0 ? Math.round((fail / total) * 100) : 0

  return (
    <Card className="hover-float flex flex-col gap-4 p-5">
      <div className={CARD_HEAD}>
        <div>
          <p className={CHART_TITLE}>Messages</p>
          <p className={CHART_HINT}>Send attempts {perHour ? "per hour" : "per day"}, delivered vs failed</p>
        </div>
        {total > 0 && (
          <span className="text-xs text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">{sent}</span> delivered
            <span className="mx-1.5">·</span>
            <span className="font-semibold tabular-nums text-foreground">{fail}</span> failed
            <span className="mx-1.5">·</span>
            <span className="font-semibold tabular-nums text-foreground">{rate}%</span> fail rate
          </span>
        )}
      </div>
      {total === 0 ? (
        <ChartEmpty text={failed ? "Could not load audit events." : "No messages in this window."} />
      ) : (
        <>
          <ChartLegend items={MESSAGE_SERIES} />
          <div className="h-[215px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={BAR_MARGIN} barCategoryGap="25%">
              <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.55} strokeDasharray="3 6" />
              <TimeXAxis perHour={perHour} count={rows.length} />
              <YAxis width={30} allowDecimals={false} tickLine={false} axisLine={false} tick={TICK} />
              <Tooltip content={<GlassTooltip />} cursor={{ fill: "var(--primary)", fillOpacity: 0.06 }} />
              <Bar dataKey="delivered" name="Delivered" stackId="m" fill="var(--success)" maxBarSize={9} />
              <Bar dataKey="failed" name="Failed" stackId="m" fill="var(--error)" maxBarSize={9} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  )
}

/* ── 3. Session lifecycle activity ───────────────────────────────────── */

export function SessionActivityChart({ entries, from, to }: { entries: AuditEntry[]; from: number; to: number }) {
  const { rows, perHour, hit } = useMemo(
    () =>
      bucketize(
        entries,
        from,
        to,
        (label) => ({ label, Created: 0, Started: 0, Stopped: 0, QR: 0 }) as Record<string, number | string>,
        (row, e) => {
          const cat = ACTIVITY_CATEGORY[e.action]
          if (!cat) return false
          row[cat] = (row[cat] as number) + 1
          return true
        },
      ),
    [entries, from, to],
  )

  return (
    <Card className="hover-float flex flex-col gap-4 p-5">
      <div className={CARD_HEAD}>
        <div>
          <p className={CHART_TITLE}>Session activity</p>
          <p className={CHART_HINT}>Lifecycle events {perHour ? "per hour" : "per day"}</p>
        </div>
        <span className="text-xs text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">{hit}</span> events
        </span>
      </div>
      {hit === 0 ? (
        <ChartEmpty text="No session events in this window." />
      ) : (
        <>
          <ChartLegend items={ACTIVITY_SERIES.map((s) => ({ label: s.key, color: s.color }))} />
          <div className="h-[215px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={BAR_MARGIN} barCategoryGap="25%">
              <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.55} strokeDasharray="3 6" />
              <TimeXAxis perHour={perHour} count={rows.length} />
              <YAxis width={30} allowDecimals={false} tickLine={false} axisLine={false} tick={TICK} />
              <Tooltip content={<GlassTooltip />} cursor={{ fill: "var(--primary)", fillOpacity: 0.06 }} />
              {ACTIVITY_SERIES.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.key}
                  stackId="a"
                  fill={s.color}
                  maxBarSize={9}
                  radius={i === ACTIVITY_SERIES.length - 1 ? [3, 3, 0, 0] : undefined}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  )
}

/* ── 4. Issues by cause ──────────────────────────────────────────────── */

export function IssuesChart({ entries, from, to, failed }: { entries: AuditEntry[]; from: number; to: number; failed?: boolean }) {
  const { rows, perHour, total, top } = useMemo(() => {
    const counts = new Map<string, number>()
    const b = bucketize(
      entries,
      from,
      to,
      (label) => {
        const row: Record<string, number | string> = { label }
        for (const s of ISSUE_SERIES) row[s.key] = 0
        return row
      },
      (row, e) => {
        const cat = issueCategoryOf(e)
        if (!cat) return false
        row[cat] = (row[cat] as number) + 1
        counts.set(cat, (counts.get(cat) ?? 0) + 1)
        return true
      },
    )
    let biggest = ""
    let biggestCount = 0
    for (const [cat, n] of counts) {
      if (n > biggestCount) {
        biggest = cat
        biggestCount = n
      }
    }
    return { rows: b.rows, perHour: b.perHour, total: b.hit, top: biggest }
  }, [entries, from, to])

  return (
    <Card className="hover-float flex flex-col gap-4 p-5">
      <div className={CARD_HEAD}>
        <div>
          <p className={CHART_TITLE}>Issues</p>
          <p className={CHART_HINT}>Warnings and errors {perHour ? "per hour" : "per day"}, by cause</p>
        </div>
        <span className="text-xs text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">{total}</span> total
          {total > 0 && top && (
            <>
              <span className="mx-1.5">·</span>
              mostly {top}
            </>
          )}
        </span>
      </div>
      {total === 0 ? (
        <ChartEmpty text={failed ? "Could not load audit events." : "No issues in this window. Nice."} />
      ) : (
        <>
          <ChartLegend items={ISSUE_SERIES.map((s) => ({ label: s.key, color: s.color }))} />
          <div className="h-[215px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={BAR_MARGIN} barCategoryGap="25%">
              <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.55} strokeDasharray="3 6" />
              <TimeXAxis perHour={perHour} count={rows.length} />
              <YAxis width={30} allowDecimals={false} tickLine={false} axisLine={false} tick={TICK} />
              <Tooltip content={<GlassTooltip />} cursor={{ fill: "var(--primary)", fillOpacity: 0.06 }} />
              {ISSUE_SERIES.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.key}
                  stackId="i"
                  fill={s.color}
                  maxBarSize={9}
                  radius={i === ISSUE_SERIES.length - 1 ? [3, 3, 0, 0] : undefined}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  )
}

/* ── 5. Workers load ─────────────────────────────────────────────────── */

export function WorkersLoad({ workers }: { workers: Worker[] }) {
  const data = useMemo(
    () => workers.map((w) => ({ name: w.name, sessions: w.sessions ?? 0, connected: w.connected })),
    [workers],
  )

  const height = Math.max(170, data.length * 34 + 40)

  return (
    <Card className="hover-float flex flex-col gap-4 p-5">
      <div className={CARD_HEAD}>
        <div>
          <p className={CHART_TITLE}>Workers load</p>
          <p className={CHART_HINT}>Sessions handled by each worker, mint is connected</p>
        </div>
        <span className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="filter-dot" style={{ background: "var(--success)" }} /> connected
          </span>
          <span className="flex items-center gap-1.5">
            <span className="filter-dot" style={{ background: OFFLINE_COLOR }} /> offline
          </span>
        </span>
      </div>
      {data.length === 0 ? (
        <ChartEmpty text="No workers to chart yet." />
      ) : (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                width={116}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: "var(--foreground)" }}
              />
              <Tooltip content={<GlassTooltip />} cursor={{ fill: "var(--primary)", fillOpacity: 0.06 }} />
              <Bar
                dataKey="sessions"
                name="Sessions"
                barSize={14}
                radius={[7, 7, 7, 7]}
                background={{ fill: "var(--muted)", fillOpacity: 0.45, radius: 7 }}
              >
                {data.map((d, i) => (
                  <Cell key={`${d.name}-${i}`} fill={d.connected ? "var(--success)" : OFFLINE_COLOR} />
                ))}
                <LabelList
                  dataKey="sessions"
                  position="right"
                  offset={8}
                  fill="var(--foreground)"
                  fontSize={12}
                  fontWeight={600}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}
