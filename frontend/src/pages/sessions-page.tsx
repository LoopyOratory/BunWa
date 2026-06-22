import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
  RefreshCw,
  RotateCcw,
  LogOut,
  MessageCircle,
  Smartphone,
  Cog,
  Search,
  MessageSquare,
} from "lucide-react"
import { api, type Session } from "@/lib/api"
import { toast } from "sonner"
import { Topbar } from "@/components/topbar"
import { QRCodeDisplay } from "@/components/qr-code"
import { SessionSettingsDialog } from "@/components/session-settings-dialog"

interface SessionsPageProps {
  onNavigate?: (page: string, options?: { sessionName?: string }) => void
}

export function SessionsPage({ onNavigate }: SessionsPageProps) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newSessionName, setNewSessionName] = useState("")
  const [showQrDialog, setShowQrDialog] = useState(false)
  const [qrSessionName, setQrSessionName] = useState("")
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)
  const [settingsSession, setSettingsSession] = useState<Session | null>(null)

  const loadSessions = useCallback(async () => {
    try {
      const data = await api.getSessions()
      setSessions(data)
    } catch {
      toast.error("Failed to load sessions")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSessions()
    const interval = setInterval(loadSessions, 3000)
    return () => clearInterval(interval)
  }, [loadSessions])

  const handleCreate = async () => {
    if (!newSessionName.trim()) return
    try {
      await api.createSession(newSessionName.trim())
      toast.success("Session created")
      setShowCreateDialog(false)
      setNewSessionName("")
      loadSessions()
    } catch {
      toast.error("Failed to create session")
    }
  }

  const handleAction = async (label: string, fn: () => Promise<any>) => {
    try {
      await fn()
      toast.success(`Session ${label} succeeded`)
      loadSessions()
    } catch {
      toast.error(`Session ${label} failed`)
    }
  }

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
    if (session.status === "STOPPED") {
      toast.error("Start the session first to get the QR code")
      return
    }
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
    <div className="flex h-full flex-col">
      <Topbar title="Sessions" onRefresh={loadSessions} />
      <div className="flex-1 overflow-auto p-3 sm:p-6">
        <div className="space-y-4 sm:space-y-6">
          {/* Stats */}
          <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalSessions}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Working</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-500">{workingSessions}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Scanning QR</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-500">{scanningSessions}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Stopped</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-muted-foreground">{stoppedSessions}</div>
              </CardContent>
            </Card>
          </div>

          {/* Sessions Table */}
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="size-5" />
                All Sessions
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 w-full sm:w-32 text-xs">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="WORKING">Working</SelectItem>
                    <SelectItem value="SCAN_QR_CODE">Scan QR</SelectItem>
                    <SelectItem value="STOPPED">Stopped</SelectItem>
                    <SelectItem value="FAILED">Failed</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search sessions"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
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
                      <TableHead className="w-16 sm:w-80">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Loading sessions...</TableCell>
                      </TableRow>
                    ) : filteredSessions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No sessions found</TableCell>
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
                            }>{session.status}</Badge>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">WAHA</TableCell>
                          <TableCell>
                            {/* Desktop */}
                            <div className="hidden sm:flex justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" disabled={session.status !== "STOPPED"} onClick={() => handleAction("start", () => api.startSession(session.name))}>
                                    <Play />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Start</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" disabled={session.status === "STOPPED"} onClick={() => handleAction("restart", () => api.restartSession(session.name))}>
                                    <RotateCcw />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Restart</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" disabled={session.status === "STOPPED"} onClick={() => handleAction("stop", () => api.stopSession(session.name))}>
                                    <Square />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Stop</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" disabled={session.status === "STOPPED"} onClick={() => handleAction("logout", () => api.logoutSession(session.name))}>
                                    <LogOut />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Logout</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" onClick={() => handleAction("delete", () => api.deleteSession(session.name))}>
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
                                    <MessageCircle />
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
                                  <Button variant="ghost" size="icon-sm" disabled={session.status !== "STOPPED"} onClick={() => handleAction("start", () => api.startSession(session.name))}>
                                    <Play />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Start</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" disabled={session.status === "STOPPED"} onClick={() => handleAction("stop", () => api.stopSession(session.name))}>
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
                                    <MessageCircle />
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
                                  <Button variant="ghost" size="icon-sm" onClick={() => handleAction("delete", () => api.deleteSession(session.name))}>
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

          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogContent className="max-w-xs sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Create New Session</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="session-name">Session Name</Label>
                  <Input
                    id="session-name"
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
            onSaved={loadSessions}
          />
        </div>
      </div>
    </div>
  )
}
