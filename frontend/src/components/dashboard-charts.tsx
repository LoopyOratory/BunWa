/**
 * Dashboard charts — live pictures of the data the console already fetches.
 *
 * Three pieces, one material: everything renders into glass cards with
 * pastel slices, so the graphs read as part of the dreamscape, not bolted on.
 *
 *   SessionsDonut  status mix of the sessions the filters let through
 *   ActivityChart  audit events per hour/day, severity stacked
 *   WorkersLoad    sessions handled by each worker
 *
 * Charts are driven only by real API data (sessions, workers, audit log).
 */
import { useMemo, useState } from "react"
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  AreaChart,
  Area,
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

function fmtHour(t: number) {
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, "0")}:00`
}
function fmtDay(t: number) {
  const d = new Date(t)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

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

const CARD_HEAD = "flex flex-wrap items-start justify-between gap-3"
const CHART_TITLE = "font-heading text-sm font-semibold tracking-tight"
const CHART_HINT = "mt-0.5 text-xs text-muted-foreground"

const TICK = { fontSize: 11, fill: "var(--muted-foreground)" } as const

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
          <p className={CHART_HINT}>Toggle the status chips above to focus this chart</p>
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

/* ── 2. Event activity ───────────────────────────────────────────────── */

export function ActivityChart({ entries, rangeHours, failed }: { entries: AuditEntry[]; rangeHours: number; failed?: boolean }) {
  const [issuesOnly, setIssuesOnly] = useState(false)

  const { rows, total, issues, perHour } = useMemo(() => {
    const now = Date.now()
    const hourMs = 3_600_000
    const dayMs = 86_400_000
    const hourly = rangeHours <= 24
    const count = hourly ? 24 : Math.max(1, Math.round(rangeHours / 24))
    const step = hourly ? hourMs : dayMs
    const end = Math.ceil(now / step) * step
    const start = end - count * step

    const buckets = Array.from({ length: count }, (_, i) => {
      const t = start + i * step
      return { label: hourly ? fmtHour(t) : fmtDay(t), info: 0, warn: 0, error: 0 }
    })

    let seen = 0
    let bad = 0
    for (const e of entries) {
      const t = Date.parse(e.createdAt)
      if (Number.isNaN(t) || t < start) continue
      const idx = Math.min(count - 1, Math.max(0, Math.floor((t - start) / step)))
      const sev = e.severity === "error" ? "error" : e.severity === "warn" ? "warn" : "info"
      buckets[idx][sev] += 1
      seen += 1
      if (sev !== "info") bad += 1
    }
    return { rows: buckets, total: seen, issues: bad, perHour: hourly }
  }, [entries, rangeHours])

  return (
    <Card className="hover-float flex flex-col gap-4 p-5">
      <div className={CARD_HEAD}>
        <div>
          <p className={CHART_TITLE}>Event activity</p>
          <p className={CHART_HINT}>
            Audit log entries {perHour ? "per hour" : "per day"}, severity stacked
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" className="filter-chip" data-active={!issuesOnly} onClick={() => setIssuesOnly(false)}>
            All
          </button>
          <button type="button" className="filter-chip" data-active={issuesOnly} onClick={() => setIssuesOnly(true)}>
            Issues
          </button>
          <span className="ms-1 text-xs text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">{issuesOnly ? issues : total}</span>{" "}
            {issuesOnly ? "issues" : "events"}
          </span>
        </div>
      </div>
      {total === 0 ? (
        <ChartEmpty text={failed ? "Could not load audit events." : "No audit events in this window."} />
      ) : (
        <div className="h-[215px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="act-info" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.03} />
                </linearGradient>
                <linearGradient id="act-warn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--warning)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--warning)" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="act-error" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--error)" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="var(--error)" stopOpacity={0.07} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.55} strokeDasharray="3 6" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={TICK}
                interval={perHour ? 3 : Math.max(0, Math.floor(rows.length / 10) - 1)}
                minTickGap={16}
              />
              <YAxis width={30} allowDecimals={false} tickLine={false} axisLine={false} tick={TICK} />
              <Tooltip content={<GlassTooltip />} cursor={{ stroke: "var(--primary)", strokeOpacity: 0.3 }} />
              {!issuesOnly && (
                <Area
                  type="monotone"
                  dataKey="info"
                  name="Info"
                  stackId="1"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  fill="url(#act-info)"
                  isAnimationActive={false}
                />
              )}
              <Area
                type="monotone"
                dataKey="warn"
                name="Warnings"
                stackId="1"
                stroke="var(--warning)"
                strokeWidth={2}
                fill="url(#act-warn)"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="error"
                name="Errors"
                stackId="1"
                stroke="var(--error)"
                strokeWidth={2}
                fill="url(#act-error)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

/* ── 3. Workers load ─────────────────────────────────────────────────── */

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
