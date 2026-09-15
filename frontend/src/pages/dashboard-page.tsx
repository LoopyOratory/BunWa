import { useEffect, useState, useCallback } from "react"
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
  MoreHorizontal,
} from "lucide-react"
import { api, type ServerVersion, type Session, type Worker } from "@/lib/api"
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
import { SessionSettingsDialog } from "@/components/session-settings-dialog"
import { CreateSessionDialog } from "@/components/create-session-dialog"
import { SessionDetailDialog } from "@/pages/session-detail-dialog"

interface DashboardPageProps {
  onNavigate?: (page: string, options?: { sessionName?: string }) => void
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
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)
  const [settingsSession, setSettingsSession] = useState<Session | null>(null)
  const [showDetailDialog, setShowDetailDialog] = useState(false)
  const [detailSession, setDetailSession] = useState<Session | null>(null)

  const load = useCallback(async () => {
    // Each request fails on its own so one broken endpoint does not blank the
    // whole overview.
    const [sessionsResult, workersResult, versionResult] = await Promise.allSettled([
      api.getSessions(),
      api.getWorkers(),
      api.getVersion(),
    ])

    if (sessionsResult.status === "fulfilled") {
      setSessions(sessionsResult.value)
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
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [load])

  const workingCount = sessions.filter((s) => s.status === "WORKING").length
  const attentionCount = sessions.filter((s) => s.status !== "WORKING" && s.status !== "STOPPED").length
  const connectedWorkers = workers.filter((w) => w.connected).length

  const filteredSessions = sessions.filter((s) => {
    if (!sessionSearch) return true
    const q = sessionSearch.toLowerCase()
    return (
      s.name.toLowerCase().includes(q) ||
      s.me?.pushName?.toLowerCase().includes(q) ||
      s.me?.id?.toLowerCase().includes(q) ||
      JSON.stringify(s.config).toLowerCase().includes(q)
    )
  })

  const filteredWorkers = workers.filter((w) => {
    if (!workerSearch) return true
    return w.name.toLowerCase().includes(workerSearch.toLowerCase())
  })

  return (
    <PageLayout
      title="Dashboard"
      description="Overview of your sessions, workers, and system health"
      actions={
        <Button variant="ghost" size="icon" onClick={load} title="Refresh" aria-label="Refresh">
          <RefreshCw className="size-4" strokeWidth={1.75} />
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Stats */}
        {loading ? (
          <StatRowSkeleton count={3} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            <StatCard
              label="Sessions"
              value={sessionsError ? "-" : String(sessions.length)}
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
            <StatCard
              label="Workers"
              value={workersError ? "-" : String(workers.length)}
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
            <StatCard
              label="Server version"
              value={version ? version.version : "-"}
              hint={
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {version?.engine ? (
                    <EngineBadge engine={version.engine} />
                  ) : (
                    <span>Version unavailable</span>
                  )}
                  <Link to="/docs" className="font-medium text-foreground underline-offset-4 hover:underline">
                    Changelog
                  </Link>
                  <Link to="/docs" className="font-medium text-foreground underline-offset-4 hover:underline">
                    How to update
                  </Link>
                </span>
              }
              icon={<CloudDownload strokeWidth={1.75} />}
            />
          </div>
        )}

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
                  className="h-8 w-full pl-8 text-xs sm:w-48"
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
                    className="h-8 w-full pl-8 text-xs sm:w-60"
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
                      {session.me?.pushName ||
                        (session.me?.id ? (
                          <Metric>{session.me.id}</Metric>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        ))}
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
                              onSelect={() => api.startSession(session.name).then(load).catch(() => toast.error("Start failed"))}
                            >
                              <Play strokeWidth={1.75} />
                              Start
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={session.status === "STOPPED"}
                              title={session.status === "STOPPED" ? "The session is already stopped" : undefined}
                              onSelect={() => api.restartSession(session.name).then(load).catch(() => toast.error("Restart failed"))}
                            >
                              <RotateCcw strokeWidth={1.75} />
                              Restart
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={session.status === "STOPPED"}
                              title={session.status === "STOPPED" ? "The session is already stopped" : undefined}
                              onSelect={() => api.stopSession(session.name).then(load).catch(() => toast.error("Stop failed"))}
                            >
                              <Square strokeWidth={1.75} />
                              Stop
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={session.status === "STOPPED"}
                              title={session.status === "STOPPED" ? "The session is already stopped" : undefined}
                              onSelect={() => api.logoutSession(session.name).then(load).catch(() => toast.error("Logout failed"))}
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
                              onSelect={() => api.deleteSession(session.name).then(load).catch(() => toast.error("Delete failed"))}
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
