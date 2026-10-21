import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Download, RefreshCw, Search } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageLayout } from "@/components/page-layout"
import { DataTable, ErrorState, Metric, SectionHeading, Skeleton, StatCard, StatRowSkeleton } from "@/components/primitives"
import {
  ActivityByHour,
  FailureReasons,
  FeatureUsage,
  MessagesOverTime,
  SessionsCompared,
  WebhooksOverTime,
} from "@/components/analytics/analytics-charts"
import { api, type AnalyticsData, type DashboardRange, type ErrorKind, type ErrorReport } from "@/lib/api"
import { cn } from "@/lib/utils"

const RANGES: DashboardRange[] = ["1h", "24h", "7d", "30d"]
const ALL = "__all__"
const PAGE_SIZE = 50
const POLL_MS = 30_000

const KIND_LABEL: Record<ErrorKind, string> = {
  send: "Send failed",
  refused: "Refused by limits",
  webhook: "Webhook failed",
  mcp: "MCP tool failed",
  session: "Session dropped",
  auth: "Auth failed",
}
const KINDS = Object.keys(KIND_LABEL) as ErrorKind[]

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 1000) / 10}%` : "-")

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * Analytics: what was sent, what failed and why, per session and per feature,
 * when it happens, how stable sessions are, and a filterable error report.
 * Range and session live in the URL so a view can be shared.
 */
export function AnalyticsPage() {
  const [params, setParams] = useSearchParams()
  const range = (RANGES.includes(params.get("range") as DashboardRange) ? params.get("range") : "24h") as DashboardRange
  const session = params.get("session") || undefined

  const setFilter = (key: "range" | "session", value: string | undefined) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const [data, setData] = useState<AnalyticsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const requestKey = `${range}|${session ?? ""}`
  // The filters the last settled request was for; loading until it matches.
  const [settledKey, setSettledKey] = useState<string | null>(null)
  const loading = settledKey !== requestKey
  const keyRef = useRef(requestKey)
  useEffect(() => {
    keyRef.current = requestKey
  }, [requestKey])

  const load = useCallback(async () => {
    const key = `${range}|${session ?? ""}`
    try {
      const next = await api.getAnalytics(range, session)
      if (keyRef.current !== key) return
      setData(next)
      setError(null)
    } catch (e) {
      if (keyRef.current !== key) return
      setError(e instanceof Error ? e.message : "Could not load analytics")
    } finally {
      if (keyRef.current === key) setSettledKey(key)
    }
  }, [range, session])

  useEffect(() => {
    const first = setTimeout(() => void load(), 0)
    const interval = setInterval(() => void load(), POLL_MS)
    return () => {
      clearTimeout(first)
      clearInterval(interval)
    }
  }, [load])

  const sessionNames = useMemo(() => {
    const names = new Set((data?.sessions ?? []).map((s) => s.name))
    if (session) names.add(session)
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [data, session])

  const fresh = data && `${data.range.key}|${data.session ?? ""}` === requestKey ? data : null

  return (
    <PageLayout
      title="Analytics"
      description="Sends, failures, webhooks and errors, per session and feature"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Select value={session ?? ALL} onValueChange={(v) => setFilter("session", v === ALL ? undefined : v)}>
            <SelectTrigger className="h-8 w-44" aria-label="Session">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All sessions</SelectItem>
              {sessionNames.map((name) => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex rounded-full border border-border/70 bg-card/60 p-0.5" role="group" aria-label="Time range">
            {RANGES.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={range === key}
                onClick={() => setFilter("range", key === "24h" ? undefined : key)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                  range === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {key}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="icon" onClick={() => void load()} title="Refresh" aria-label="Refresh">
            <RefreshCw className="size-4" strokeWidth={1.75} />
          </Button>
        </div>
      }
    >
      <div className="space-y-8">
        {loading && !fresh ? (
          <>
            <StatRowSkeleton count={4} />
            <Skeleton className="h-72 w-full rounded-lg" />
          </>
        ) : error && !data ? (
          <ErrorState title="Could not load analytics" description={error} onRetry={() => void load()} />
        ) : data ? (
          <>
            {error && <p className="text-xs text-warning-foreground">Showing the last answer; the latest refresh failed: {error}</p>}
            <Kpis data={fresh ?? data} />

            <section className="space-y-3">
              <SectionHeading title="Messages" description={`Last ${data.range.key}${data.session ? ` · ${data.session}` : " · all sessions"}`} />
              <div className="grid gap-4 lg:grid-cols-3">
                <MessagesOverTime data={data} />
                <FailureReasons data={data} />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <SessionsCompared data={data} />
                <FeatureUsage data={data} />
              </div>
              <ActivityByHour data={data} />
            </section>

            <section className="space-y-3">
              <SectionHeading title="Delivery and stability" description="Webhooks, session connections and agent tool use" />
              <div className="grid gap-4 lg:grid-cols-2">
                <WebhooksOverTime data={data} />
                <FailingWebhooks data={data} />
              </div>
              <div className="grid gap-4 lg:grid-cols-5">
                <Stability data={data} />
                <McpTools data={data} />
              </div>
            </section>
          </>
        ) : null}

        <ErrorReportSection range={range} session={session} />
      </div>
    </PageLayout>
  )
}

function Kpis({ data }: { data: AnalyticsData }) {
  const { sent, failed, refused, webhookDelivered, webhookFailed } = data.totals
  const attempts = sent + failed
  const hooks = webhookDelivered + webhookFailed
  const working = data.sessions.filter((s) => s.status === "WORKING").length
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Messages sent" value={sent} hint={<>{pct(sent, attempts)} of <Metric>{attempts}</Metric> attempts succeeded</>} tone="success" />
      <StatCard
        label="Failed sends"
        value={failed - refused}
        hint={<><Metric>{refused}</Metric> more refused by sending limits</>}
        tone={failed - refused > 0 ? "error" : "neutral"}
      />
      <StatCard
        label="Webhooks delivered"
        value={webhookDelivered}
        hint={hooks > 0 ? <>{pct(webhookDelivered, hooks)} success · <Metric>{webhookFailed}</Metric> failed</> : "No deliveries in this range"}
        tone={webhookFailed > 0 ? "warning" : "neutral"}
      />
      <StatCard
        label="Sessions working"
        value={<>{working}<span className="text-lg text-muted-foreground">/{data.sessions.length}</span></>}
        hint={<><Metric>{data.mcp.calls}</Metric> MCP tool calls · <Metric>{data.auth.failed}</Metric> rejected API keys</>}
        tone={working < data.sessions.length ? "warning" : "success"}
      />
    </div>
  )
}

function FailingWebhooks({ data }: { data: AnalyticsData }) {
  const rows = data.webhooks.failing
  return (
    <Card className="flex min-w-0 flex-col gap-3 p-5">
      <div>
        <h3 className="font-heading text-sm font-semibold tracking-tight">Failing webhook targets</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">Grouped by session and URL, most failures first</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No webhook failures in this range.</p>
      ) : (
        <ul className="space-y-2">
          {rows.slice(0, 8).map((hook) => (
            <li key={`${hook.session}:${hook.url}`} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate font-mono text-xs" title={hook.url ?? undefined}>{hook.url ?? "unknown URL"}</span>
                <Metric className="font-semibold text-error-foreground">{hook.count}</Metric>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {hook.session ?? "no session"}{hook.lastError ? ` · ${hook.lastError}` : ""} · last {new Date(hook.lastAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Stability({ data }: { data: AnalyticsData }) {
  return (
    <Card className="flex min-w-0 flex-col gap-3 p-5 lg:col-span-3">
      <div>
        <h3 className="font-heading text-sm font-semibold tracking-tight">Session stability</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">Connections, drops and QR requests in this range</p>
      </div>
      {data.stability.length === 0 ? (
        <p className="text-sm text-muted-foreground">No session connected or dropped in this range.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Session</TableHead>
                <TableHead className="text-right">Connected</TableHead>
                <TableHead className="text-right">Dropped</TableHead>
                <TableHead className="text-right">QR</TableHead>
                <TableHead className="text-right">Stops</TableHead>
                <TableHead className="text-right">Crashes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.stability.map((s) => (
                <TableRow key={s.session}>
                  <TableCell className="font-medium">{s.session}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.connected}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", s.disconnected > 0 && "text-warning-foreground")}>{s.disconnected}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.qr}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.stopped}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", s.errors > 0 && "text-error-foreground")}>{s.errors}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  )
}

function McpTools({ data }: { data: AnalyticsData }) {
  return (
    <Card className="flex min-w-0 flex-col gap-3 p-5 lg:col-span-2">
      <div>
        <h3 className="font-heading text-sm font-semibold tracking-tight">MCP tools used</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          <Metric>{data.mcp.calls}</Metric> write calls · <Metric>{data.mcp.failed}</Metric> failed ({pct(data.mcp.failed, data.mcp.calls)})
        </p>
      </div>
      {data.mcp.tools.length === 0 ? (
        <p className="text-sm text-muted-foreground">No agent used a write tool in this range.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tool</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Failed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.mcp.tools.map((t) => (
                <TableRow key={t.tool}>
                  <TableCell className="font-mono text-xs">{t.tool}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.calls}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", t.failed > 0 && "text-error-foreground")}>{t.failed}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  )
}

/* ── Error report ─────────────────────────────────────────────────────── */

function ErrorReportSection({ range, session }: { range: DashboardRange; session?: string }) {
  const [kind, setKind] = useState<ErrorKind | undefined>(undefined)
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  const [report, setReport] = useState<ErrorReport | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  // Debounce typing; any filter change starts at page one.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])
  const filterKey = `${range}|${session ?? ""}|${kind ?? ""}|${query}`
  const [lastFilterKey, setLastFilterKey] = useState(filterKey)
  if (lastFilterKey !== filterKey) {
    setLastFilterKey(filterKey)
    setPage(0)
  }

  const requestKey = `${filterKey}|${page}`
  const [settledKey, setSettledKey] = useState<string | null>(null)
  const loading = settledKey !== requestKey

  useEffect(() => {
    let cancelled = false
    api
      .getErrorReport({ range, session, kind, q: query || undefined, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      .then((next) => {
        if (cancelled) return
        setReport(next)
        setFailure(null)
      })
      .catch((e) => !cancelled && setFailure(e instanceof Error ? e.message : "Could not load errors"))
      .finally(() => !cancelled && setSettledKey(requestKey))
    return () => {
      cancelled = true
    }
  }, [range, session, kind, query, page, requestKey])

  const exportCsv = async () => {
    setExporting(true)
    try {
      const all = await api.getErrorReport({ range, session, kind, q: query || undefined, limit: 500 })
      const header = ["time", "kind", "session", "action", "severity", "status", "error", "path", "details"]
      const lines = [
        header.join(","),
        ...all.rows.map((r) =>
          [r.at, KIND_LABEL[r.kind], r.session, r.action, r.severity, r.statusCode, r.errorMessage, r.path, r.metadata].map(csvCell).join(","),
        ),
      ]
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `bunwa-errors-${range}${session ? `-${session}` : ""}-${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      URL.revokeObjectURL(url)
      if (all.total > all.rows.length) toast.info(`Exported the newest ${all.rows.length} of ${all.total} errors`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed")
    } finally {
      setExporting(false)
    }
  }

  const totalAll = report ? KINDS.reduce((n, k) => n + report.byKind[k], 0) : 0
  const pages = report ? Math.max(1, Math.ceil(report.total / PAGE_SIZE)) : 1

  return (
    <section className="space-y-3">
      <SectionHeading
        title="Error report"
        description="Every failure in this range, newest first"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
              <Input
                placeholder="Search errors"
                aria-label="Search errors"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-52 pl-8"
              />
            </div>
            <Button size="sm" variant="outline" onClick={() => void exportCsv()} disabled={exporting || !report?.total}>
              <Download className="size-4" strokeWidth={1.75} />
              Export CSV
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Error kind">
        <KindChip active={!kind} onClick={() => setKind(undefined)} label="All" count={totalAll} />
        {KINDS.map((k) => (
          <KindChip key={k} active={kind === k} onClick={() => setKind(kind === k ? undefined : k)} label={KIND_LABEL[k]} count={report?.byKind[k] ?? 0} />
        ))}
      </div>

      {failure && !report ? (
        <ErrorState compact title="Could not load the error report" description={failure} />
      ) : (
        <DataTable minWidthClassName="min-w-[760px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">Time</TableHead>
              <TableHead className="w-40">Kind</TableHead>
              <TableHead className="w-36">Session</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={cn(loading && "opacity-60")}>
            {report && report.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                  {query || kind ? "No errors match these filters." : "No errors in this range."}
                </TableCell>
              </TableRow>
            ) : (
              report?.rows.map((row) => {
                const open = expanded === row.id
                return (
                  <ErrorRow key={row.id} row={row} open={open} onToggle={() => setExpanded(open ? null : row.id)} />
                )
              })
            )}
          </TableBody>
        </DataTable>
      )}

      {report && report.total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {page * PAGE_SIZE + 1}-{Math.min(report.total, (page + 1) * PAGE_SIZE)} of <Metric>{report.total}</Metric>
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </section>
  )
}

function KindChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border/70 text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      <span className={cn("tabular-nums", !active && count > 0 && "text-foreground")}>{count}</span>
    </button>
  )
}

const KIND_TONE: Record<ErrorKind, string> = {
  send: "text-error-foreground",
  refused: "text-warning-foreground",
  webhook: "text-error-foreground",
  mcp: "text-error-foreground",
  session: "text-warning-foreground",
  auth: "text-warning-foreground",
}

function ErrorRow({ row, open, onToggle }: { row: ErrorReport["rows"][number]; open: boolean; onToggle: () => void }) {
  const summary =
    row.errorMessage ||
    (row.kind === "session" ? "The session disconnected" : row.kind === "auth" ? `Rejected API key${row.path ? ` on ${row.path}` : ""}` : row.action)
  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle} aria-expanded={open}>
        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{new Date(row.at).toLocaleString()}</TableCell>
        <TableCell className={cn("text-xs font-medium", KIND_TONE[row.kind])}>{KIND_LABEL[row.kind]}</TableCell>
        <TableCell className="text-xs">{row.session ?? "-"}</TableCell>
        <TableCell className="max-w-0 truncate text-sm" title={summary}>{summary}</TableCell>
      </TableRow>
      {open && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={4}>
            <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
              <dt className="text-muted-foreground">Action</dt>
              <dd className="font-mono">{row.action}</dd>
              {row.statusCode !== null && (
                <>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="tabular-nums">{row.statusCode}</dd>
                </>
              )}
              {row.path && (
                <>
                  <dt className="text-muted-foreground">Path</dt>
                  <dd className="font-mono">{row.path}</dd>
                </>
              )}
              {row.errorMessage && (
                <>
                  <dt className="text-muted-foreground">Error</dt>
                  <dd className="whitespace-pre-wrap break-words">{row.errorMessage}</dd>
                </>
              )}
              {row.metadata && (
                <>
                  <dt className="text-muted-foreground">Details</dt>
                  <dd>
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-background/60 p-2 font-mono">
                      {JSON.stringify(row.metadata, null, 2)}
                    </pre>
                  </dd>
                </>
              )}
            </dl>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
