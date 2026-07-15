import { useEffect, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
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
  MessageSquare,
  Server,
  CloudDownload,
  CheckCircle,
  Search,
  Play,
  Square,
  LogOut,
  Trash2,
  Link2,
  RotateCcw,
  QrCode,
  MessageCircle,
  Smartphone,
  Cog,
  ExternalLink,
  Plus,
  Loader2,
  RefreshCw,
} from "lucide-react"
import { api, type Session, type Worker } from "@/lib/api"
import { toast } from "sonner"
import { PageLayout } from "@/components/page-layout"
import { SessionSettingsDialog } from "@/components/session-settings-dialog"
import { CreateSessionDialog } from "@/components/create-session-dialog"
import { SessionDetailDialog } from "@/pages/session-detail-dialog"

let dashboardWorkersFailed = false

interface DashboardPageProps {
  onNavigate?: (page: string, options?: { sessionName?: string }) => void
}

export function DashboardPage(_props?: DashboardPageProps) {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<Session[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [sessionSearch, setSessionSearch] = useState("")
  const [workerSearch, setWorkerSearch] = useState("")
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)
  const [settingsSession, setSettingsSession] = useState<Session | null>(null)
  const [showDetailDialog, setShowDetailDialog] = useState(false)
  const [detailSession, setDetailSession] = useState<Session | null>(null)

  const loadWorkers = useCallback(async (sessionCount: number, version: { engine?: string; version?: string; tier?: string } | null) => {
    if (dashboardWorkersFailed) return
    try {
      const w = await api.getWorkers()
      setWorkers(w)
    } catch {
      dashboardWorkersFailed = true
      setWorkers([{
        name: "BunWa",
        apiUrl: window.location.origin,
        engine: version?.engine || "NOWEB",
        version: version?.version || "",
        tier: version?.tier || "",
        uptime: "00:00:00",
        sessions: sessionCount,
        connected: true,
      }])
    }
  }, [])

  const load = useCallback(async () => {
    try {
      const [s, v] = await Promise.all([
        api.getSessions().catch(() => [] as Session[]),
        api.getVersion().catch(() => null),
      ])
      setSessions(s)
      loadWorkers(s.length, v)
    } catch (e) {
      console.error(e)
    }
  }, [loadWorkers])

  useEffect(() => {
    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [load])

  const workingCount = sessions.filter((s) => s.status === "WORKING").length
  const attentionCount = sessions.filter((s) => s.status !== "WORKING" && s.status !== "STOPPED").length

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
        <Button variant="ghost" size="icon" onClick={load} title="Refresh">
          <RefreshCw />
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Stats Cards */}
          <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 animate-slide-up">
            <Card className="stat-card">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Sessions</CardTitle>
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
                  <MessageSquare className="size-6 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold tracking-tight tracking-tight">{sessions.length}</div>
                <p className="text-xs text-base text-muted-foreground">
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">{workingCount} working</span>
                  {attentionCount > 0 && (
                    <>
                      <span className="text-muted-foreground mx-1">&middot;</span>
                      <span className="font-medium text-amber-600 dark:text-amber-400">{attentionCount} needs attention</span>
                    </>
                  )}
                </p>
              </CardContent>
            </Card>
            <Card className="stat-card">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Workers</CardTitle>
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
                  <Server className="size-6 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold tracking-tight tracking-tight">{workers.length}</div>
                <p className="text-xs text-base text-muted-foreground">
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">{workers.filter((w) => w.connected).length} connected</span>
                </p>
              </CardContent>
            </Card>
            <Card className="col-span-2 sm:col-span-1 stat-card">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Updates</CardTitle>
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
                  <CloudDownload className="size-6 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="size-6 text-emerald-600 dark:text-emerald-400" />
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">All workers up to date!</span>
                </div>
                <div className="mt-1 flex gap-3 text-xs text-base text-muted-foreground">
                  <a href="https://waha.devlike.pro/docs/overview/changelog/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                    Changelog <ExternalLink className="size-3" />
                  </a>
                  <a href="https://waha.devlike.pro/blog/waha-update/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                    How to Update <ExternalLink className="size-3" />
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Workers Table */}
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                  <Server className="size-5 text-primary" />
                </div>
                Workers
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="default" size="sm">
                  <Link2 className="size-5" />
                  <span className="hidden sm:inline ml-1">Connect</span>
                </Button>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search"
                    value={workerSearch}
                    onChange={(e) => setWorkerSearch(e.target.value)}
                    className="h-8 w-full sm:w-48 pl-8 text-xs"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden sm:table-cell">API</TableHead>
                      <TableHead>Info</TableHead>
                      <TableHead className="hidden md:table-cell">Sessions</TableHead>
                      <TableHead className="w-20" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredWorkers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-base text-muted-foreground">
                          No workers found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredWorkers.map((worker) => (
                        <TableRow key={worker.name}>
                          <TableCell className="font-medium">{worker.name}</TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <div className="flex items-center gap-1">
                              {worker.connected ? (
                                <CheckCircle className="size-5 text-green-500" />
                              ) : (
                                <CheckCircle className="size-5 text-destructive" />
                              )}
                              <a href={worker.apiUrl} target="_blank" rel="noopener noreferrer" className="ml-1 hover:underline text-xs">
                                {worker.apiUrl}
                              </a>
                            </div>
                          </TableCell>
                          <TableCell>
                            <code className="rounded bg-muted px-1 py-0.5 text-xs">{worker.engine}</code>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-xs text-muted-foreground">{worker.version}</span>
                              {worker.tier && (
                                <Badge
                                  variant={worker.tier === "PLUS" ? "default" : "outline"}
                                  className={worker.tier === "PLUS" ? "bg-amber-500 hover:bg-amber-500" : ""}
                                >
                                  {worker.tier}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <Badge variant="secondary">{worker.sessions} sessions</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-10 transition-all duration-150 hover:scale-110 hover:bg-accent active:scale-95"><Link2 /></Button>
                                </TooltipTrigger>
                                <TooltipContent>Connect</TooltipContent>
                              </Tooltip>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Sessions Table */}
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                  <MessageSquare className="size-5 text-primary" />
                </div>
                Sessions
              </CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search sessions"
                    value={sessionSearch}
                    onChange={(e) => setSessionSearch(e.target.value)}
                    className="h-8 w-full sm:w-60 pl-8 text-xs"
                  />
                </div>
                <Button size="sm" onClick={() => setShowCreateDialog(true)}>
                  <Plus className="size-5" />
                  <span className="hidden sm:inline ml-1">Start New</span>
                </Button>
                <CreateSessionDialog
                  open={showCreateDialog}
                  onOpenChange={setShowCreateDialog}
                  onCreated={load}
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden lg:table-cell">Account</TableHead>
                      <TableHead className="w-24 sm:w-28">Status</TableHead>
                      <TableHead className="hidden sm:table-cell">Engine</TableHead>
                      <TableHead className="w-16 sm:w-72">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSessions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center text-base text-muted-foreground">
                          No sessions found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredSessions.map((session) => (
                        <TableRow key={session.name}>
                          <TableCell>
                            <Badge variant={session.status === "WORKING" ? "default" : "secondary"} className="size-2 rounded-full p-0" />
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="truncate max-w-[120px] sm:max-w-none">{session.name}</div>
                            <div className="sm:hidden text-xs text-muted-foreground truncate max-w-[120px]">{session.me?.pushName || ""}</div>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {session.me?.pushName || session.me?.id || <span className="text-base text-muted-foreground">-</span>}
                          </TableCell>
                          <TableCell>
                            <Badge variant={
                              session.status === "WORKING" ? "default"
                              : session.status === "SCAN_QR_CODE" ? "secondary"
                              : session.status === "FAILED" ? "destructive"
                              : session.status === "STARTING" ? "secondary"
                              : "outline"
                            } className="inline-flex items-center gap-1">
                              {session.status === "STARTING" && <Loader2 className="size-3 animate-spin" />}
                              {session.status === "SCAN_QR_CODE" ? "SCAN_QR" : session.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Badge variant="outline" className={
                              session.config?.engine === "WEBJS"
                                ? "bg-purple-500/10 text-purple-500 border-purple-500/20"
                                : "bg-blue-500/10 text-blue-500 border-blue-500/20"
                            }>
                              {session.config?.engine || "NOWEB"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className={`hidden sm:flex justify-end gap-1 session-actions ${session.status === "WORKING" ? "session-active" : ""}`}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-10" disabled={session.status !== "STOPPED"} onClick={() => api.startSession(session.name).then(load).catch(() => toast.error("Start failed"))}>
                                    <Play />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Start</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-10" disabled={session.status === "STOPPED"} onClick={() => api.restartSession(session.name).then(load).catch(() => toast.error("Restart failed"))}>
                                    <RotateCcw />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Restart</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-10" disabled={session.status === "STOPPED"} onClick={() => api.stopSession(session.name).then(load).catch(() => toast.error("Stop failed"))}>
                                    <Square />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Stop</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-10" disabled={session.status === "STOPPED"} onClick={() => api.logoutSession(session.name).then(load).catch(() => toast.error("Logout failed"))}>
                                    <LogOut />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Logout</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-10" onClick={() => api.deleteSession(session.name).then(load).catch(() => toast.error("Delete failed"))}>
                                    <Trash2 />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Delete</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-10" disabled={session.status !== "SCAN_QR_CODE"} onClick={() => { setDetailSession(session); setShowDetailDialog(true) }}>
                                    <QrCode />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>QR / Pairing</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-10" disabled={session.status !== "WORKING" || session.config?.engine !== "WEBJS"} onClick={() => api.getScreenshot(session.name).then(() => toast.success("Screenshot taken")).catch(() => toast.error("Screenshot failed"))}>
                                    <Smartphone />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Screenshot (WEBJS)</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-10" disabled={session.status !== "WORKING"} onClick={() => navigate(`/sessions/${session.name}/chat`)}>
                                    <MessageCircle />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Chat</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-10" onClick={() => { setSettingsSession(session); setShowSettingsDialog(true) }}>
                                    <Cog />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Settings</TooltipContent>
                              </Tooltip>
                            </div>
                            {/* Mobile */}
                            <div className={`flex sm:hidden justify-end gap-1 ${session.status === "WORKING" ? "session-active" : ""}`}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-10" disabled={session.status !== "STOPPED"} onClick={() => api.startSession(session.name).then(load).catch(() => toast.error("Start failed"))}>
                                    <Play />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Start</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-10" disabled={session.status === "STOPPED"} onClick={() => api.stopSession(session.name).then(load).catch(() => toast.error("Stop failed"))}>
                                    <Square />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Stop</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-10" disabled={session.status !== "SCAN_QR_CODE"} onClick={() => { setDetailSession(session); setShowDetailDialog(true) }}>
                                    <QrCode />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>QR</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-10" disabled={session.status !== "WORKING"} onClick={() => navigate(`/sessions/${session.name}/chat`)}>
                                    <MessageCircle />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Chat</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-10" onClick={() => { setSettingsSession(session); setShowSettingsDialog(true) }}>
                                    <Cog />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Settings</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-10" onClick={() => api.deleteSession(session.name).then(load).catch(() => toast.error("Delete failed"))}>
                                    <Trash2 />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Delete</TooltipContent>
                              </Tooltip>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
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
