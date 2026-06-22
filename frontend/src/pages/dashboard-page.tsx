import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
  Eye,
  Smartphone,
  Cog,
  ExternalLink,
  Plus,
  RefreshCw,
} from "lucide-react"
import { api, type Session, type Worker } from "@/lib/api"
import { toast } from "sonner"
import { Topbar } from "@/components/topbar"
import { QRCodeDisplay } from "@/components/qr-code"
import { SessionSettingsDialog } from "@/components/session-settings-dialog"

let dashboardWorkersFailed = false

interface DashboardPageProps {
  onNavigate?: (page: string, options?: { sessionName?: string }) => void
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [sessionSearch, setSessionSearch] = useState("")
  const [workerSearch, setWorkerSearch] = useState("")
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newSessionName, setNewSessionName] = useState("")
  const [showQrDialog, setShowQrDialog] = useState(false)
  const [qrSessionName, setQrSessionName] = useState("")
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)
  const [settingsSession, setSettingsSession] = useState<Session | null>(null)

  const loadWorkers = useCallback(async (sessionCount: number, version: { engine?: string; version?: string; tier?: string } | null) => {
    if (dashboardWorkersFailed) return
    try {
      const w = await api.getWorkers()
      setWorkers(w)
    } catch {
      dashboardWorkersFailed = true
      setWorkers([{
        name: "WAHA",
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

  const fetchQr = useCallback(async (name: string) => {
    try {
      const response = await api.getQRCode(name)
      if (response.qr?.raw) {
        setQrUrl(response.qr.raw)
      }
    } catch {
      // silent - QR may not be ready yet
    }
  }, [])

  const handleShowQr = async (name: string) => {
    const session = sessions.find((s) => s.name === name)
    if (!session) return
    if (session.status !== "SCAN_QR_CODE") {
      toast.error(`Session must be in SCAN_QR_CODE status, current: ${session.status}`)
      return
    }
    setQrSessionName(name)
    setShowQrDialog(true)
    setQrUrl(null)
    await fetchQr(name)
  }

  useEffect(() => {
    if (!showQrDialog || !qrSessionName) return
    const interval = setInterval(() => fetchQr(qrSessionName), 5000)
    return () => clearInterval(interval)
  }, [showQrDialog, qrSessionName, fetchQr])

  const handleCreate = async () => {
    if (!newSessionName.trim()) return
    try {
      await api.createSession(newSessionName.trim())
      toast.success("Session created")
      setShowCreateDialog(false)
      setNewSessionName("")
      load()
    } catch {
      toast.error("Failed to create session")
    }
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Dashboard" onRefresh={load} />
      <div className="flex-1 overflow-auto p-3 sm:p-6">
        <div className="space-y-4 sm:space-y-6">
          {/* Stats Cards */}
          <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Sessions</CardTitle>
                <MessageSquare className="size-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{sessions.length}</div>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-green-500">{workingCount} working</span>
                  <span className="text-muted-foreground">, </span>
                  <span className="font-medium text-orange-400">{attentionCount} needs attention</span>
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Workers</CardTitle>
                <Server className="size-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{workers.length}</div>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-green-500">{workers.filter((w) => w.connected).length} connected</span>
                </p>
              </CardContent>
            </Card>
            <Card className="col-span-2 sm:col-span-1">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Updates</CardTitle>
                <CloudDownload className="size-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="size-5 text-green-500" />
                  <span className="font-medium text-green-500">All workers up to date!</span>
                </div>
                <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
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
              <CardTitle className="flex items-center gap-2">
                <Server className="size-5" />
                Workers
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="default" size="sm" className="bg-green-600 hover:bg-green-700">
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
                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
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
                                <CheckCircle className="size-4 text-green-500" />
                              ) : (
                                <CheckCircle className="size-4 text-destructive" />
                              )}
                              <a href={worker.apiUrl} target="_blank" rel="noopener noreferrer" className="ml-1 hover:underline text-xs">
                                {worker.apiUrl}
                              </a>
                            </div>
                          </TableCell>
                          <TableCell>
                            <code className="rounded bg-muted px-1 py-0.5 text-xs">{worker.engine}</code>
                            <div className="text-xs text-muted-foreground mt-0.5">{worker.version} {worker.tier}</div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <Badge variant="secondary">{worker.sessions} sessions</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm"><Link2 /></Button>
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
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="size-5" />
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
                <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="size-5" />
                      <span className="hidden sm:inline ml-1">Start New</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-xs sm:max-w-sm">
                    <DialogHeader>
                      <DialogTitle>Create New Session</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="dash-session-name">Session Name</Label>
                        <Input
                          id="dash-session-name"
                          value={newSessionName}
                          onChange={(e) => setNewSessionName(e.target.value)}
                          placeholder="e.g., my-session"
                          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                        />
                      </div>
                      <Button onClick={handleCreate} className="w-full">
                        <Plus className="mr-2 size-5" />
                        Create
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
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
                      <TableHead className="hidden sm:table-cell">Server</TableHead>
                      <TableHead className="w-16 sm:w-72">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSessions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
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
                            {session.me?.pushName || session.me?.id || <span className="text-muted-foreground">-</span>}
                          </TableCell>
                          <TableCell>
                            <Badge variant={
                              session.status === "WORKING" ? "default"
                              : session.status === "SCAN_QR_CODE" ? "secondary"
                              : session.status === "FAILED" ? "destructive"
                              : "outline"
                            }>
                              {session.status === "SCAN_QR_CODE" ? "SCAN_QR" : session.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">WAHA</TableCell>
                          <TableCell>
                            {/* Desktop */}
                            <div className="hidden sm:flex justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" disabled={session.status !== "STOPPED"} onClick={() => api.startSession(session.name).then(load).catch(() => toast.error("Start failed"))}>
                                    <Play />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Start</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" disabled={session.status === "STOPPED"} onClick={() => api.restartSession(session.name).then(load).catch(() => toast.error("Restart failed"))}>
                                    <RotateCcw />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Restart</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" disabled={session.status === "STOPPED"} onClick={() => api.stopSession(session.name).then(load).catch(() => toast.error("Stop failed"))}>
                                    <Square />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Stop</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" disabled={session.status === "STOPPED"} onClick={() => api.logoutSession(session.name).then(load).catch(() => toast.error("Logout failed"))}>
                                    <LogOut />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Logout</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" onClick={() => api.deleteSession(session.name).then(load).catch(() => toast.error("Delete failed"))}>
                                    <Trash2 />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Delete</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" disabled={session.status !== "SCAN_QR_CODE"} onClick={() => handleShowQr(session.name)}>
                                    <QrCode />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>QR Code</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" disabled={true}>
                                    <Smartphone />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Screenshot (WEBJS only)</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" disabled={session.status !== "WORKING"} onClick={() => onNavigate?.("chat", { sessionName: session.name })}>
                                    <Eye />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Chat</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" onClick={() => { setSettingsSession(session); setShowSettingsDialog(true) }}>
                                    <Cog />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Settings</TooltipContent>
                              </Tooltip>
                            </div>
                            {/* Mobile */}
                            <div className="flex sm:hidden justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" disabled={session.status !== "STOPPED"} onClick={() => api.startSession(session.name).then(load).catch(() => toast.error("Start failed"))}>
                                    <Play />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Start</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" disabled={session.status === "STOPPED"} onClick={() => api.stopSession(session.name).then(load).catch(() => toast.error("Stop failed"))}>
                                    <Square />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Stop</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" disabled={session.status !== "SCAN_QR_CODE"} onClick={() => handleShowQr(session.name)}>
                                    <QrCode />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>QR</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" disabled={session.status !== "WORKING"} onClick={() => onNavigate?.("chat", { sessionName: session.name })}>
                                    <Eye />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Chat</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" onClick={() => { setSettingsSession(session); setShowSettingsDialog(true) }}>
                                    <Cog />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Settings</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" onClick={() => api.deleteSession(session.name).then(load).catch(() => toast.error("Delete failed"))}>
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
      </div>

      <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
        <DialogContent className="max-w-xs sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>QR Code - {qrSessionName}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {qrUrl ? (
              <QRCodeDisplay data={qrUrl} size={256} />
            ) : (
              <div className="flex flex-col items-center gap-2">
                <RefreshCw className="size-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading QR code...</p>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => fetchQr(qrSessionName)}>
              <RefreshCw className="size-4 mr-1" /> Refresh
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Open WhatsApp → Settings → Linked Devices → Link a Device
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <SessionSettingsDialog
        open={showSettingsDialog}
        onOpenChange={setShowSettingsDialog}
        session={settingsSession}
        onSaved={load}
      />
    </div>
  )
}
