import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Metric } from "@/components/primitives"
import { api, type AnalyticsData, type CalendarMonth } from "@/lib/api"
import { cn } from "@/lib/utils"

/*
 * The analytics visuals that are not axis charts: success-rate rings,
 * sending-limit progress bars and the monthly activity calendar. Every value
 * is also written out as text, so nothing is told by colour alone.
 */

const TITLE = "font-heading text-sm font-semibold tracking-tight"
const HINT = "mt-0.5 text-xs text-muted-foreground"

/* ── Ring gauges ──────────────────────────────────────────────────────── */

interface GaugeSpec {
  label: string
  /** 0-100, or null when there is nothing to measure. */
  percent: number | null
  detail: string
}

function Ring({ spec }: { spec: GaugeSpec }) {
  const size = 132
  const stroke = 12
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const value = spec.percent ?? 0
  // Below 80% is worth a second look; colour follows the label, never replaces it.
  const color = spec.percent === null ? "var(--muted)" : value >= 95 ? "var(--series-sent)" : value >= 80 ? "var(--series-refused)" : "var(--series-failed)"
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div
        className="relative"
        style={{ width: size, height: size }}
        role="meter"
        aria-label={spec.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={spec.percent ?? undefined}
        aria-valuetext={spec.percent === null ? "no data" : `${spec.percent}%`}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
          {spec.percent !== null && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - Math.min(100, value) / 100)}
              className="transition-[stroke-dashoffset] duration-700"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Metric className="font-heading text-2xl font-semibold">{spec.percent === null ? "-" : `${spec.percent}%`}</Metric>
        </div>
      </div>
      <div>
        <p className="text-sm font-medium">{spec.label}</p>
        <p className="text-xs text-muted-foreground">{spec.detail}</p>
      </div>
    </div>
  )
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null)

export function SuccessGauges({ data }: { data: AnalyticsData }) {
  const { sent, failed, webhookDelivered, webhookFailed } = data.totals
  const working = data.sessions.filter((s) => s.status === "WORKING").length
  const mcpOk = data.mcp.calls - data.mcp.failed
  const gauges: GaugeSpec[] = [
    { label: "Message success", percent: pct(sent, sent + failed), detail: `${sent} of ${sent + failed} sent` },
    { label: "Webhook success", percent: pct(webhookDelivered, webhookDelivered + webhookFailed), detail: `${webhookDelivered} of ${webhookDelivered + webhookFailed} delivered` },
    { label: "MCP tool success", percent: pct(mcpOk, data.mcp.calls), detail: `${mcpOk} of ${data.mcp.calls} calls` },
    { label: "Sessions working", percent: pct(working, data.sessions.length), detail: `${working} of ${data.sessions.length} sessions` },
  ]
  return (
    <Card className="p-5">
      <div className="mb-4">
        <h3 className={TITLE}>Health at a glance</h3>
        <p className={HINT}>Success rates over the selected range; green from 95%, amber from 80%</p>
      </div>
      <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
        {gauges.map((g) => (
          <Ring key={g.label} spec={g} />
        ))}
      </div>
    </Card>
  )
}

/* ── Sending-limit usage bars ─────────────────────────────────────────── */

function LimitBar({ label, used, cap }: { label: string; used: number; cap: number }) {
  const unlimited = cap <= 0
  const ratio = unlimited ? 0 : Math.min(1, used / cap)
  const tone = unlimited ? "" : ratio >= 1 ? "var(--series-failed)" : ratio >= 0.8 ? "var(--series-refused)" : "var(--series-sent)"
  return (
    <div className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={unlimited ? undefined : cap}
        aria-valuenow={used}
      >
        {!unlimited && <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${ratio * 100}%`, background: tone }} />}
      </div>
      <span className="w-24 text-right tabular-nums">
        <Metric className="text-foreground">{used}</Metric>
        <span className="text-muted-foreground"> / {unlimited ? "no limit" : cap}</span>
        {!unlimited && ratio >= 1 && <span className="ms-1 font-semibold text-error-foreground">full</span>}
      </span>
    </div>
  )
}

export function LimitUsage({ data }: { data: AnalyticsData }) {
  const sessions = data.sessions.filter((s) => s.limits && (!data.session || s.name === data.session))
  return (
    <Card className="flex min-w-0 flex-col gap-4 p-5">
      <div>
        <h3 className={TITLE}>Sending limits in use</h3>
        <p className={HINT}>Messages counted against each limit right now; 0 in settings means no limit</p>
      </div>
      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sending limits to show.</p>
      ) : (
        <div className="space-y-5">
          {sessions.map((s) => (
            <div key={s.name} className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium">{s.name}</p>
                {!s.limits!.enabled && <span className="text-xs text-muted-foreground">limits off</span>}
              </div>
              <LimitBar label="Last minute" {...s.limits!.minute} />
              <LimitBar label="Last hour" {...s.limits!.hour} />
              <LimitBar label="Last 24 hours" {...s.limits!.day} />
              <LimitBar label="New chats today" {...s.limits!.newChats} />
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

/* ── Activity calendar ────────────────────────────────────────────────── */

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
// Sequential: one hue, light to dark, mixed into the card surface so the
// steps keep their order in light and dark mode.
const STEPS = [0, 30, 50, 70, 90]
const stepColor = (step: number) =>
  step === 0 ? "transparent" : `color-mix(in oklab, var(--series-sent) ${STEPS[step]}%, var(--card))`

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split("-").map(Number)
  return monthKey(new Date(y, m - 1 + delta, 1))
}

export function ActivityCalendar({ session }: { session?: string }) {
  const thisMonth = monthKey(new Date())
  const [month, setMonth] = useState(thisMonth)
  const [data, setData] = useState<CalendarMonth | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .getCalendar(month, session)
      .then((next) => {
        if (cancelled) return
        setData(next)
        setFailure(null)
      })
      .catch((e) => !cancelled && setFailure(e instanceof Error ? e.message : "Could not load the calendar"))
    return () => {
      cancelled = true
    }
  }, [month, session])

  const { cells, thresholds, total, busiest } = useMemo(() => {
    const [y, m] = month.split("-").map(Number)
    const first = new Date(y, m - 1, 1)
    const daysInMonth = new Date(y, m, 0).getDate()
    const lead = (first.getDay() + 6) % 7 // Monday first
    const byDate = new Map((data?.month === month ? data.days : []).map((d) => [d.date, d]))
    const list: Array<{ day: number; date: string; sent: number; failed: number } | null> = Array.from({ length: lead }, () => null)
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${month}-${String(day).padStart(2, "0")}`
      const row = byDate.get(date)
      list.push({ day, date, sent: row?.sent ?? 0, failed: row?.failed ?? 0 })
    }
    const counts = list.filter(Boolean).map((c) => c!.sent + c!.failed)
    const top = list.reduce<(typeof list)[number]>((best, c) => (c && (!best || c.sent + c.failed > best.sent + best.failed) ? c : best), null)
    // Grade by rank among active days (quartiles), so one unusually busy day
    // does not wash every other day out to the lightest step.
    const active = counts.filter((n) => n > 0).sort((a, b) => a - b)
    const quantile = (q: number) => active[Math.min(active.length - 1, Math.floor(q * active.length))]
    const cuts = active.length ? [quantile(0.25), quantile(0.5), quantile(0.75)] : []
    return { cells: list, thresholds: cuts, total: counts.reduce((a, b) => a + b, 0), busiest: top && top.sent + top.failed > 0 ? top : null }
  }, [data, month])

  const step = (count: number) => (count === 0 ? 0 : 1 + thresholds.filter((cut) => count > cut).length)
  const today = new Date().toLocaleDateString("en-CA")
  const title = new Date(`${month}-01T00:00:00`).toLocaleDateString([], { month: "long", year: "numeric" })

  return (
    <Card className="flex min-w-0 flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className={TITLE}>Activity calendar</h3>
          <p className={HINT}>
            Messages per day{session ? ` · ${session}` : ""} · <Metric>{total}</Metric> this month
            {busiest && <> · busiest {busiest.day} {title.split(" ")[0]} (<Metric>{busiest.sent + busiest.failed}</Metric>)</>}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-7" aria-label="Previous month" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
            <ChevronLeft className="size-4" strokeWidth={1.75} />
          </Button>
          <span className="min-w-28 text-center text-sm font-medium">{title}</span>
          <Button variant="ghost" size="icon" className="size-7" aria-label="Next month" disabled={month >= thisMonth} onClick={() => setMonth((m) => shiftMonth(m, 1))}>
            <ChevronRight className="size-4" strokeWidth={1.75} />
          </Button>
        </div>
      </div>
      {failure ? (
        <p className="text-sm text-error-foreground">{failure}</p>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1.5 text-center text-xs" role="grid" aria-label={`Messages per day, ${title}`}>
            {WEEKDAYS.map((d) => (
              <div key={d} className="pb-1 font-medium text-muted-foreground" role="columnheader">{d}</div>
            ))}
            {cells.map((cell, i) =>
              cell ? (
                <div
                  key={cell.date}
                  role="gridcell"
                  title={`${cell.date}: ${cell.sent} sent, ${cell.failed} failed`}
                  aria-label={`${cell.date}: ${cell.sent} sent, ${cell.failed} failed`}
                  className={cn(
                    "relative flex aspect-square min-h-8 flex-col items-center justify-center rounded-md border border-border/50 tabular-nums transition-colors",
                    cell.date === today && "ring-2 ring-primary ring-offset-1 ring-offset-card",
                    cell.date > today && "opacity-40",
                  )}
                  style={{ background: stepColor(step(cell.sent + cell.failed)) }}
                >
                  <span className={cn("font-medium", step(cell.sent + cell.failed) === 4 && "text-white")}>{cell.day}</span>
                  {cell.failed > 0 && (
                    <span className="absolute right-1 top-1 size-1.5 rounded-full" style={{ background: "var(--series-failed)" }} aria-hidden />
                  )}
                </div>
              ) : (
                <div key={`lead-${i}`} aria-hidden />
              ),
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              Less
              {[0, 1, 2, 3, 4].map((s) => (
                <span key={s} className="inline-block size-3 rounded-sm border border-border/50" style={{ background: stepColor(s) }} />
              ))}
              More
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-1.5 rounded-full" style={{ background: "var(--series-failed)" }} />
              day with failures
            </span>
          </div>
        </>
      )}
    </Card>
  )
}
