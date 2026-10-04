import { useEffect, useMemo, useState, useCallback, useRef } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  MessageSquare,
  Server,
  CloudDownload,
  Search,
  Play,
  Square,
  LogOut,
  Trash2,
  RotateCcw,
  QrCode,
  MessageCircle,
  Smartphone,
  Cog,
  Plus,
  RefreshCw,
  FilterX,
  MoreHorizontal,
  Send,
  TriangleAlert,
} from "lucide-react"
import { api, type AuditEntry, type ServerVersion, type Session, type Worker } from "@/lib/api"
import { toast } from "sonner"
import { PageLayout } from "@/components/page-layout"
import {
  DataTable,
  EmptyState,
  EngineBadge,
  ErrorState,
  Metric,
  SectionHeading,
  StatCard,
  StatRowSkeleton,
  StatusBadge,
  TableSkeleton,
} from "@/components/primitives"
import {
  IssuesChart,
  MessagesChart,
  SessionActivityChart,
  SessionsDonut,
  WorkersLoad,
  isIssue,
  issueCategoryOf,
} from "@/components/dashboard-charts"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SessionSettingsDialog } from "@/components/session-settings-dialog"
import { CreateSessionDialog } from "@/components/create-session-dialog"
import { SessionDetailDialog } from "@/pages/session-detail-dialog"
import { CountUp, Stagger, StaggerItem } from "@/components/dream"

interface DashboardPageProps {
  onNavigate?: (page: string, options?: { sessionName?: string }) => void
}

/** Local-date string (YYYY-MM-DD) for the range inputs. */
const localDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

type SessionAccount = NonNullable<Session["me"]>

/* The list route (GET /api/sessions) returns SessionInfo without `me`; only
   the detail route (GET /api/sessions/:session) carries the account. Fetch it
   once per working session and cache by name so the 5s poll adds no requests. */
function useSessionAccounts() {
  const cacheRef = useRef(new Map<string, SessionAccount>())
  const lastStatusRef = useRef(new Map<string, Session["status"]>())

  return useCallback(async (list: Session[]): Promise<Session[]> => {
    const cache = cacheRef.current
    for (const session of list) {
      const previous = lastStatusRef.current.get(session.name)
      // A stop or restart can unlink the account; drop the cached value so a
      // dash stays truthful until the session reports one again.
      if (previous !== undefined && previous !== session.status && session.status !== "WORKING") {
        cache.delete(session.name)
      }
      lastStatusRef.current.set(session.name, session.status)
    }

    const missing = list.filter((s) => s.status === "WORKING" && !s.me && !cache.has(s.name))
    if (missing.length > 0) {
      const details = await Promise.allSettled(missing.map((s) => api.getSession(s.name)))
      details.forEach((result, index) => {
        if (result.status === "fulfilled" && result.value.me) cache.set(missing[index].name, result.value.me)
      })
    }

    return list.map((s) =>
      s.me || s.status !== "WORKING" || !cache.has(s.name) ? s : { ...s, me: cache.get(s.name) }
    )
  }, [])
}

/** Why the account column is empty, for the dash's title attribute. */
function accountEmptyHint(status: Session["status"]): string {
  return status === "WORKING" || status === "STARTING"
    ? "The session has not reported its account details yet."
    : "No account is linked while the session is not connected."
}

export function DashboardPage(_props?: DashboardPageProps) {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<Session[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [version, setVersion] = useState<ServerVersion | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionsError, setSessionsError] = useState<string | null>(null)
  const [workersError, setWorkersError] = useState<string | null>(null)
  const [sessionSearch, setSessionSearch] = useState("")
  const [workerSearch, setWorkerSearch] = useState("")
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [auditFailed, setAuditFailed] = useState(false)
  const [sessionFilter, setSessionFilter] = useState<string>("all")
  const [engineFilter, setEngineFilter] = useState<"all" | "NOWEB" | "WEBJS">("all")
  const [fromDate, setFromDate] = useState<string>(() => localDateStr(new Date()))
  const [toDate, setToDate] = useState<string>(() => localDateStr(new Date()))
  const lastAuditFetch = useRef(0)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)
  const [settingsSession, setSettingsSession] = useState<Session | null>(null)
  const [showDetailDialog, setShowDetailDialog] = useState(false)
  const [detailSession, setDetailSession] = useState<Session | null>(null)

  const withAccounts = useSessionAccounts()

  const load = useCallback(async (opts?: { force?: boolean }) => {
    // Each request fails on its own so one broken endpoint does not blank the
    // whole overview. The audit log refreshes on a slower 30s cadence since it
    // is only feeding the activity chart.
    const now = Date.now()
    const wantAudit = opts?.force === true || now - lastAuditFetch.current > 30_000
    if (wantAudit) lastAuditFetch.current = now
    const [sessionsResult, workersResult, versionResult, auditResult] = await Promise.allSettled([
      api.getSessions(),
      api.getWorkers(),
      api.getVersion(),
      wantAudit ? api.getAudit({ limit: 500 }) : Promise.resolve<AuditEntry[] | null>(null),
    ])

    if (auditResult.status === "fulfilled" && auditResult.value) {
      setAudit(auditResult.value)
      setAuditFailed(false)
    } else if (auditResult.status === "rejected") {
      setAuditFailed(true)
    }

    if (sessionsResult.status === "fulfilled") {
      setSessions(await withAccounts(sessionsResult.value))
      setSessionsError(null)
    } else {
      setSessionsError("Could not load sessions from the API.")
    }

    if (workersResult.status === "fulfilled") {
      setWorkers(workersResult.value)
      setWorkersError(null)
    } else {
      setWorkersError("Could not load workers from the API.")
    }

    setVersion(versionResult.status === "fulfilled" ? versionResult.value : null)
    setLoading(false)
  }, [withAccounts])

  useEffect(() => {
    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [load])

  const workingCount = sessions.filter((s) => s.status === "WORKING").length
  const attentionCount = sessions.filter((s) => s.status !== "WORKING" && s.status !== "STOPPED").length
  const connectedWorkers = workers.filter((w) => w.connected).length

  /* ── Filters driving the insights row ───────────────────────────────
     The session dropdown scopes the charts, KPIs and the sessions table;
     the engine filter applies to sessions and workers alike; the date
     range picks the window every time series reads. */
  const engineOf = (s: Session) => (s.config?.engine ? String(s.config.engine).toUpperCase() : "NOWEB")

  const engineSessions = sessions.filter((s) => engineFilter === "all" || engineOf(s) === engineFilter)
  const dropdownSessions = engineSessions.filter((s) => sessionFilter === "all" || s.name === sessionFilter)
  const engineWorkers = workers.filter(
    (w) => engineFilter === "all" || String(w.engine || "").toUpperCase() === engineFilter,
  )

  // Drop back to "all" when the picked session disappears (deleted, or renamed).
  useEffect(() => {
    if (sessionFilter !== "all" && !sessions.some((s) => s.name === sessionFilter)) setSessionFilter("all")
  }, [sessions, sessionFilter])

  const fromTs = useMemo(() => Date.parse(`${fromDate}T00:00:00`), [fromDate])
  const toTs = useMemo(() => Date.parse(`${toDate}T23:59:59.999`), [toDate])
  const rangeAudit = useMemo(
    () => (sessionFilter === "all" ? audit : audit.filter((e) => e.sessionName === sessionFilter)),
    [audit, sessionFilter],
  )

  const todayStr = localDateStr(new Date())
  const presetFrom = (days: number) => {
    const n = new Date()
    return localDateStr(new Date(n.getFullYear(), n.getMonth(), n.getDate() - (days - 1)))
  }
  const setQuickRange = (days: number) => {
    setFromDate(presetFrom(days))
    setToDate(todayStr)
  }
  const onFromChange = (v: string) => {
    if (!v) return
    if (toDate && v > toDate) setToDate(v)
    setFromDate(v)
  }
  const onToChange = (v: string) => {
    if (!v) return
    if (fromDate && v < fromDate) setFromDate(v)
    setToDate(v)
  }

  const filtersActive = sessionFilter !== "all" || engineFilter !== "all" || fromDate !== todayStr || toDate !== todayStr
  const resetFilters = () => {
    setSessionFilter("all")
    setEngineFilter("all")
    setFromDate(todayStr)
    setToDate(todayStr)
  }

  const filteredSessions = dropdownSessions.filter((s) => {
    if (!sessionSearch) return true
    const q = sessionSearch.toLowerCase()
    return (
      s.name.toLowerCase().includes(q) ||
      s.me?.pushName?.toLowerCase().includes(q) ||
      s.me?.id?.toLowerCase().includes(q) ||
      JSON.stringify(s.config).toLowerCase().includes(q)
    )
  })

  const filteredWorkers = engineWorkers.filter((w) => {
    if (!workerSearch) return true
    return w.name.toLowerCase().includes(workerSearch.toLowerCase())
  })

  /* ── Aggregates from the audit log, for the KPI cards ─────────────── */
  const auditStats = useMemo(() => {
    let sent = 0
    let failed = 0
    const byCat = new Map<string, number>()
    for (const e of rangeAudit) {
      const t = Date.parse(e.createdAt)
      if (Number.isNaN(t) || t < fromTs || t > toTs) continue
      if (e.action === "message_sent") sent++
      else if (e.action === "message_failed") failed++
      if (isIssue(e)) {
        const cat = issueCategoryOf(e) ?? "Other"
        byCat.set(cat, (byCat.get(cat) ?? 0) + 1)
      }
    }
    let issues = 0
    let top = ""
    let topN = 0
    for (const [cat, n] of byCat) {
      issues += n
      if (n > topN) {
        top = cat
        topN = n
      }
    }
    const total = sent + failed
    return { sent, failed, issues, top, rate: total > 0 ? Math.round((failed / total) * 100) : 0, total }
  }, [rangeAudit, fromTs, toTs])

  return (
    <PageLayout
      title="Dashboard"
      description="Overview of your sessions, workers, and system health"
      actions={
        <Button variant="ghost" size="icon" onClick={() => load({ force: true })} title="Refresh" aria-label="Refresh">
          <RefreshCw className="size-4" strokeWidth={1.75} />
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Stats */}
        {loading ? (
          <StatRowSkeleton count={5} />
        ) : (
          <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
            <StaggerItem>
              <StatCard
                label="Sessions"
                value={sessionsError ? "-" : <CountUp value={sessions.length} />}
              tone={attentionCount > 0 ? "warning" : "neutral"}
              hint={
                sessionsError ? (
                  "Unavailable"
                ) : attentionCount > 0 ? (
                  <>
                    <Metric>{workingCount}</Metric> working, <Metric>{attentionCount}</Metric> need attention
                  </>
                ) : (
                  <>
                    <Metric>{workingCount}</Metric> working
                  </>
                )
              }
              icon={<MessageSquare strokeWidth={1.75} />}
            />
            </StaggerItem>
            <StaggerItem>
              <StatCard
                label="Workers"
                value={workersError ? "-" : <CountUp value={workers.length} />}
                tone={workersError ? "error" : "neutral"}
              hint={
                workersError ? (
                  "Unavailable"
                ) : workers.length === 0 ? (
                  "No workers reporting"
                ) : (
                  <>
                    <Metric>{connectedWorkers}</Metric> connected
                  </>
                )
              }
              icon={<Server strokeWidth={1.75} />}
              />
            </StaggerItem>
            <StaggerItem>
              <StatCard
                label="Messages"
                value={auditFailed ? "-" : <CountUp value={auditStats.total} />}
                tone={!auditFailed && auditStats.failed > 0 ? "warning" : "neutral"}
                hint={
                  auditFailed ? (
                    "Unavailable"
                  ) : auditStats.total === 0 ? (
                    "No send attempts in this range"
                  ) : (
                    <>
                      <Metric>{auditStats.failed}</Metric> failed, <Metric>{auditStats.rate}%</Metric> of attempts
                    </>
                  )
                }
                icon={<Send strokeWidth={1.75} />}
              />
            </StaggerItem>
            <StaggerItem>
              <StatCard
                label="Issues"
                value={auditFailed ? "-" : <CountUp value={auditStats.issues} />}
                tone={!auditFailed && auditStats.issues > 0 ? "error" : "neutral"}
                hint={
                  auditFailed ? (
                    "Unavailable"
                  ) : auditStats.issues === 0 ? (
                    "All clear in this window"
                  ) : (
                    <>
                      mostly <Metric>{auditStats.top}</Metric>
                    </>
                  )
                }
                icon={<TriangleAlert strokeWidth={1.75} />}
              />
            </StaggerItem>
            <StaggerItem className="max-lg:col-span-2">
              <StatCard
                label="Server version"
              value={version ? version.version : "-"}
              hint={version?.engine ? <><Metric>{version.engine}</Metric> engine</> : "Version unavailable"}
              icon={<CloudDownload strokeWidth={1.75} />}
            />
            </StaggerItem>
          </Stagger>
        )}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-muted-foreground">
          <span>BunWa docs:</span>
          <Link to="/docs" className="font-medium text-foreground underline-offset-4 hover:underline">
            Changelog
          </Link>
          <Link to="/docs" className="font-medium text-foreground underline-offset-4 hover:underline">
            How to update
          </Link>
        </p>

        {/* Insights: filters drive the charts and the tables below */}
        <section className="space-y-3">
          <SectionHeading
            title="Insights"
            description="Charts read the latest 500 audit entries, scoped by session and range"
            action={
              <Button variant="ghost" size="sm" onClick={resetFilters} disabled={!filtersActive}>
                <FilterX className="size-4" strokeWidth={1.75} />
                Reset filters
              </Button>
            }
          />

          <div className="glass-card flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl px-4 py-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="me-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Session</span>
              <Select value={sessionFilter} onValueChange={setSessionFilter}>
                <SelectTrigger className="h-8 w-full sm:w-52" aria-label="Filter by session">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sessions</SelectItem>
                  {sessions.map((s) => (
                    <SelectItem key={s.name} value={s.name}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="me-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Engine</span>
              {(["all", "NOWEB", "WEBJS"] as const).map((k) => (
                <button key={k} type="button" className="filter-chip" data-active={engineFilter === k} onClick={() => setEngineFilter(k)}>
                  {k === "all" ? "All engines" : k}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="me-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Range</span>
              <Input
                type="date"
                aria-label="From date"
                value={fromDate}
                max={toDate}
                onChange={(e) => onFromChange(e.target.value)}
                className="h-8 w-[9.5rem] [color-scheme:light] dark:[color-scheme:dark]"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                aria-label="To date"
                value={toDate}
                min={fromDate}
                max={todayStr}
                onChange={(e) => onToChange(e.target.value)}
                className="h-8 w-[9.5rem] [color-scheme:light] dark:[color-scheme:dark]"
              />
              {([[1, "Today"], [7, "7d"], [30, "30d"]] as const).map(([days, label]) => (
                <button
                  key={days}
                  type="button"
                  className="filter-chip"
                  data-active={fromDate === presetFrom(days) && toDate === todayStr}
                  onClick={() => setQuickRange(days)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <SessionsDonut sessions={dropdownSessions} />
            <div className="lg:col-span-2">
              <MessagesChart entries={rangeAudit} from={fromTs} to={toTs} failed={auditFailed} />
            </div>
            <SessionActivityChart entries={rangeAudit} from={fromTs} to={toTs} />
            <IssuesChart entries={rangeAudit} from={fromTs} to={toTs} failed={auditFailed} />
            <WorkersLoad workers={engineWorkers} />
          </div>
        </section>

        {/* Workers */}
        <section className="space-y-3">
          <SectionHeading
            title="Workers"
            description="Instances reporting to this server"
            action={
              <div className="relative">
                <Search
                  className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  strokeWidth={1.75}
                />
                <Input
                  placeholder="Search workers"
                  aria-label="Search workers"
                  value={workerSearch}
                  onChange={(e) => setWorkerSearch(e.target.value)}
                  className="h-8 w-full pl-8 sm:w-48"
                />
              </div>
            }
          />

          {loading ? (
            <TableSkeleton rows={2} columns={4} />
          ) : workersError ? (
            <ErrorState
              compact
              title="Could not load workers"
              description={workersError}
              onRetry={load}
            />
          ) : workers.length === 0 ? (
            <EmptyState
              compact
              icon={<Server strokeWidth={1.75} />}
              title="No workers found"
              description="No worker instance has registered with this server."
            />
          ) : filteredWorkers.length === 0 ? (
            <EmptyState
              compact
              icon={<Search strokeWidth={1.75} />}
              title="No matching workers"
              description="Adjust the search text to see more."
              action={
                <Button variant="outline" size="sm" onClick={() => setWorkerSearch("")}>
                  Clear search
                </Button>
              }
            />
          ) : (
            <DataTable>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">API</TableHead>
                  <TableHead>Info</TableHead>
                  <TableHead className="hidden md:table-cell">Sessions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredWorkers.map((worker) => (
                  <TableRow key={worker.name}>
                    <TableCell className="font-medium">{worker.name}</TableCell>
                    <TableCell>
                      <StatusBadge kind={worker.connected ? "working" : "failed"} />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <a
                        href={worker.apiUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                      >
                        {worker.apiUrl}
                      </a>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <EngineBadge engine={worker.engine} />
                        {worker.version && (
                          <span className="text-xs text-muted-foreground">
                            <Metric>{worker.version}</Metric>
                          </span>
                        )}
                        {worker.tier && (
                          <Badge variant="outline" className="font-mono">
                            {worker.tier}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm text-muted-foreground">
                        <Metric>{worker.sessions}</Metric> sessions
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </DataTable>
          )}
        </section>

        {/* Sessions */}
        <section className="space-y-3">
          <SectionHeading
            title="Sessions"
            description="Connected WhatsApp sessions"
            action={
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 sm:flex-none">
                  <Search
                    className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    strokeWidth={1.75}
                  />
                  <Input
                    placeholder="Search sessions"
                    aria-label="Search sessions"
                    value={sessionSearch}
                    onChange={(e) => setSessionSearch(e.target.value)}
                    className="h-8 w-full pl-8 sm:w-60"
                  />
                </div>
                <Button size="sm" onClick={() => setShowCreateDialog(true)}>
                  <Plus className="size-4" strokeWidth={1.75} />
                  Create session
                </Button>
                <CreateSessionDialog
                  open={showCreateDialog}
                  onOpenChange={setShowCreateDialog}
                  onCreated={load}
                />
              </div>
            }
          />

          {loading ? (
            <TableSkeleton rows={4} columns={5} />
          ) : sessionsError ? (
            <ErrorState
              title="Could not load sessions"
              description={sessionsError}
              onRetry={load}
            />
          ) : sessions.length === 0 ? (
            <EmptyState
              icon={<MessageSquare strokeWidth={1.75} />}
              title="No sessions yet"
              description="Create a session to get started."
              action={
                <Button size="sm" onClick={() => setShowCreateDialog(true)}>
                  <Plus className="size-4" strokeWidth={1.75} />
                  Create session
                </Button>
              }
            />
          ) : filteredSessions.length === 0 ? (
            <EmptyState
              icon={<Search strokeWidth={1.75} />}
              title="No matching sessions"
              description="Adjust the search text to see more."
              action={
                <Button variant="outline" size="sm" onClick={() => setSessionSearch("")}>
                  Clear search
                </Button>
              }
            />
          ) : (
            <DataTable minWidthClassName="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden lg:table-cell">Account</TableHead>
                  <TableHead className="hidden sm:table-cell">Engine</TableHead>
                  <TableHead className="w-14" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSessions.map((session) => (
                  <TableRow key={session.name}>
                    <TableCell>
                      <StatusBadge status={session.status} />
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="max-w-[120px] truncate sm:max-w-none">{session.name}</div>
                      <div className="max-w-[120px] truncate text-xs text-muted-foreground sm:hidden">
                        {session.me?.pushName || ""}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {session.me ? (
                        <div className="min-w-0">
                          {session.me.pushName && (
                            <div className="truncate font-medium">{session.me.pushName}</div>
                          )}
                          <Metric className="block truncate text-xs text-muted-foreground">
                            {session.me.id}
                          </Metric>
                        </div>
                      ) : (
                        <span className="text-muted-foreground" title={accountEmptyHint(session.status)}>
                          -
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <EngineBadge engine={session.config?.engine} />
                    </TableCell>
                    <TableCell>
                      <div className={`flex justify-end ${session.status === "WORKING" ? "session-active" : ""}`}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              aria-label={`Session actions for ${session.name}`}
                            >
                              <MoreHorizontal className="size-4" strokeWidth={1.75} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem
                              disabled={session.status !== "STOPPED"}
                              title={session.status !== "STOPPED" ? "Only a stopped session can be started" : undefined}
                              onSelect={() => api.startSession(session.name).then(() => load()).catch(() => toast.error("Start failed"))}
                            >
                              <Play strokeWidth={1.75} />
                              Start
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={session.status === "STOPPED"}
                              title={session.status === "STOPPED" ? "The session is already stopped" : undefined}
                              onSelect={() => api.restartSession(session.name).then(() => load()).catch(() => toast.error("Restart failed"))}
                            >
                              <RotateCcw strokeWidth={1.75} />
                              Restart
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={session.status === "STOPPED"}
                              title={session.status === "STOPPED" ? "The session is already stopped" : undefined}
                              onSelect={() => api.stopSession(session.name).then(() => load()).catch(() => toast.error("Stop failed"))}
                            >
                              <Square strokeWidth={1.75} />
                              Stop
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={session.status === "STOPPED"}
                              title={session.status === "STOPPED" ? "The session is already stopped" : undefined}
                              onSelect={() => api.logoutSession(session.name).then(() => load()).catch(() => toast.error("Logout failed"))}
                            >
                              <LogOut strokeWidth={1.75} />
                              Logout
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={session.status !== "SCAN_QR_CODE"}
                              title={session.status !== "SCAN_QR_CODE" ? "Available while the session is waiting for a QR scan" : undefined}
                              onSelect={() => {
                                setDetailSession(session)
                                setShowDetailDialog(true)
                              }}
                            >
                              <QrCode strokeWidth={1.75} />
                              QR and pairing
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={session.status !== "WORKING" || session.config?.engine !== "WEBJS"}
                              title={
                                session.status !== "WORKING" || session.config?.engine !== "WEBJS"
                                  ? "Available for a working WEBJS session"
                                  : undefined
                              }
                              onSelect={() =>
                                api
                                  .getScreenshot(session.name)
                                  .then(() => toast.success("Screenshot taken"))
                                  .catch(() => toast.error("Screenshot failed"))
                              }
                            >
                              <Smartphone strokeWidth={1.75} />
                              Screenshot
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={session.status !== "WORKING"}
                              title={session.status !== "WORKING" ? "Available for a working session" : undefined}
                              onSelect={() => navigate(`/sessions/${session.name}/chat`)}
                            >
                              <MessageCircle strokeWidth={1.75} />
                              Chat
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => {
                                setSettingsSession(session)
                                setShowSettingsDialog(true)
                              }}
                            >
                              <Cog strokeWidth={1.75} />
                              Settings
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => api.deleteSession(session.name).then(() => load()).catch(() => toast.error("Delete failed"))}
                            >
                              <Trash2 strokeWidth={1.75} />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </DataTable>
          )}
        </section>
      </div>

      <SessionSettingsDialog
        open={showSettingsDialog}
        onOpenChange={setShowSettingsDialog}
        session={settingsSession}
        onSaved={load}
      />
      <SessionDetailDialog
        open={showDetailDialog}
        onOpenChange={setShowDetailDialog}
        session={detailSession}
      />
    </PageLayout>
  )
}
