import { useEffect, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Plus,
  Play,
  Square,
  Trash2,
  QrCode,
  RotateCcw,
  LogOut,
  MessageCircle,
  Smartphone,
  Cog,
  Search,
  MessageSquare,
  RefreshCw,
  MoreHorizontal,
} from "lucide-react"
import { api, type Session } from "@/lib/api"
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

interface SessionsPageProps {
  onNavigate?: (page: string, options?: { sessionName?: string }) => void
}

export function SessionsPage(_props?: SessionsPageProps) {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)
  const [settingsSession, setSettingsSession] = useState<Session | null>(null)
  const [showDetailDialog, setShowDetailDialog] = useState(false)
  const [detailSession, setDetailSession] = useState<Session | null>(null)

  const loadSessions = useCallback(async () => {
    try {
      const data = await api.getSessions()
      setSessions(data)
      setError(null)
    } catch {
      setError("Could not load sessions from the API.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSessions()
    const interval = setInterval(loadSessions, 3000)
    return () => clearInterval(interval)
  }, [loadSessions])

  const handleAction = async (label: string, fn: () => Promise<any>) => {
    try {
      await fn()
      toast.success(`Session ${label} succeeded`)
      loadSessions()
    } catch {
      toast.error(`Session ${label} failed`)
    }
  }

  const toggleAutoStart = async (session: Session, next: boolean) => {
    // Optimistically reflect the change; the PUT replaces the whole config,
    // so send the existing config with only autoStart overridden.
    setSessions((prev) =>
      prev.map((s) =>
        s.name === session.name ? { ...s, config: { ...s.config, autoStart: next } } : s
      )
    )
    try {
      await api.updateSession(session.name, { ...session.config, autoStart: next })
      toast.success(`Auto-start ${next ? "enabled" : "disabled"} for ${session.name}`)
      loadSessions()
    } catch {
      toast.error("Failed to update auto-start")
      loadSessions()
    }
  }

  const filteredSessions = sessions.filter((s) => {
    if (statusFilter !== "all" && s.status !== statusFilter) return false
    if (!search) return true
    const q = search.toLowerCase()
    return (
      s.name.toLowerCase().includes(q) ||
      s.me?.pushName?.toLowerCase().includes(q) ||
      s.me?.id?.toLowerCase().includes(q)
    )
  })

  const totalSessions = sessions.length
  const workingSessions = sessions.filter((s) => s.status === "WORKING").length
  const scanningSessions = sessions.filter((s) => s.status === "SCAN_QR_CODE").length
  const stoppedSessions = sessions.filter((s) => s.status === "STOPPED").length

  return (
    <PageLayout
      title="Sessions"
      description="Manage your WhatsApp session connections"
      actions={
        <Button variant="ghost" size="icon" onClick={loadSessions} title="Refresh" aria-label="Refresh">
          <RefreshCw className="size-4" strokeWidth={1.75} />
        </Button>
      }
    >
      {loading ? (
        <div className="space-y-6">
          <StatRowSkeleton />
          <TableSkeleton rows={5} columns={6} />
        </div>
      ) : error ? (
        <ErrorState
          title="Could not load sessions"
          description={error}
          onRetry={loadSessions}
        />
      ) : (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard
              label="Total sessions"
              value={String(totalSessions)}
              icon={<MessageSquare strokeWidth={1.75} />}
            />
            <StatCard
              label="Working"
              value={String(workingSessions)}
              tone="success"
              icon={<Play strokeWidth={1.75} />}
            />
            <StatCard
              label="Scanning QR"
              value={String(scanningSessions)}
              tone="warning"
              icon={<QrCode strokeWidth={1.75} />}
            />
            <StatCard
              label="Stopped"
              value={String(stoppedSessions)}
              icon={<Square strokeWidth={1.75} />}
            />
          </div>

          {/* Sessions table */}
          <section className="space-y-3">
            <SectionHeading
              title="All sessions"
              description="Start, stop and configure each connection"
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-8 w-full text-xs sm:w-32" aria-label="Filter by status">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="WORKING">Working</SelectItem>
                      <SelectItem value="SCAN_QR_CODE">Scan QR</SelectItem>
                      <SelectItem value="STOPPED">Stopped</SelectItem>
                      <SelectItem value="FAILED">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="relative flex-1 sm:flex-none">
                    <Search
                      className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      strokeWidth={1.75}
                    />
                    <Input
                      placeholder="Search sessions"
                      aria-label="Search sessions"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
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
                    onCreated={loadSessions}
                  />
                </div>
              }
            />

            {sessions.length === 0 ? (
              <EmptyState
                icon={<MessageSquare strokeWidth={1.75} />}
                title="No sessions yet"
                description="Create a session and scan the QR code with your phone to connect it."
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
                description="Adjust the search text or status filter to see more."
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch("")
                      setStatusFilter("all")
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <DataTable minWidthClassName="min-w-[840px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden lg:table-cell">Account</TableHead>
                    <TableHead className="hidden sm:table-cell">Engine</TableHead>
                    <TableHead className="hidden md:table-cell w-24">Auto-start</TableHead>
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
                      <TableCell className="hidden md:table-cell">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex">
                              <Switch
                                checked={session.config?.autoStart === true}
                                onCheckedChange={(v) => toggleAutoStart(session, v)}
                                aria-label={`Auto-start for ${session.name}`}
                              />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Start automatically when the server boots</TooltipContent>
                        </Tooltip>
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
                                onSelect={() => handleAction("start", () => api.startSession(session.name))}
                              >
                                <Play strokeWidth={1.75} />
                                Start
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={session.status === "STOPPED"}
                                title={session.status === "STOPPED" ? "The session is already stopped" : undefined}
                                onSelect={() => handleAction("restart", () => api.restartSession(session.name))}
                              >
                                <RotateCcw strokeWidth={1.75} />
                                Restart
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={session.status === "STOPPED"}
                                title={session.status === "STOPPED" ? "The session is already stopped" : undefined}
                                onSelect={() => handleAction("stop", () => api.stopSession(session.name))}
                              >
                                <Square strokeWidth={1.75} />
                                Stop
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={session.status === "STOPPED"}
                                title={session.status === "STOPPED" ? "The session is already stopped" : undefined}
                                onSelect={() => handleAction("logout", () => api.logoutSession(session.name))}
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
                                onSelect={() => handleAction("screenshot", () => api.getScreenshot(session.name))}
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
                                onSelect={() => handleAction("delete", () => api.deleteSession(session.name))}
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
      )}

      <SessionSettingsDialog
        open={showSettingsDialog}
        onOpenChange={setShowSettingsDialog}
        session={settingsSession}
        onSaved={loadSessions}
      />
      <SessionDetailDialog
        open={showDetailDialog}
        onOpenChange={setShowDetailDialog}
        session={detailSession}
      />
    </PageLayout>
  )
}
