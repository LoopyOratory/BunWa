import { useEffect, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
  Loader2,
} from "lucide-react"
import { api, type Session } from "@/lib/api"
import { toast } from "sonner"
import { Topbar } from "@/components/topbar"
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

  const handleAction = async (label: string, fn: () => Promise<any>) => {
    try {
      await fn()
      toast.success(`Session ${label} succeeded`)
      loadSessions()
    } catch {
      toast.error(`Session ${label} failed`)
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
    <div className="flex h-full flex-col">
      <Topbar title="Sessions" onRefresh={loadSessions} />
      <div className="flex-1 overflow-auto p-3 sm:p-6">
        <div className="space-y-4 sm:space-y-6">
          {/* Stats */}
          <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Total</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold tracking-tight">{totalSessions}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Working</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold tracking-tight text-green-500">{workingSessions}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Scanning QR</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold tracking-tight text-yellow-500">{scanningSessions}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Stopped</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold tracking-tight text-base text-muted-foreground">{stoppedSessions}</div>
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
                <Button size="sm" onClick={() => setShowCreateDialog(true)}>
                  <Plus className="size-5" />
                  <span className="hidden sm:inline ml-1">Start New</span>
                </Button>
                <CreateSessionDialog
                  open={showCreateDialog}
                  onOpenChange={setShowCreateDialog}
                  onCreated={loadSessions}
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
                      <TableHead className="w-16 sm:w-80">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center text-base text-muted-foreground">Loading sessions...</TableCell>
                      </TableRow>
                    ) : filteredSessions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center text-base text-muted-foreground">No sessions found</TableCell>
                      </TableRow>
                    ) : (
                      filteredSessions.map((session) => (
                        <TableRow key={session.name}>
                          <TableCell>
                            <Badge variant={session.status === "WORKING" ? "default" : "secondary"} className="size-2 rounded-full p-0" />
                          </TableCell>
                          <TableCell className="font-medium text-base">
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
                            {/* Desktop */}
                            <div className={`hidden sm:flex justify-end gap-1 session-actions ${session.status === "WORKING" ? "session-active" : ""}`}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-10" disabled={session.status !== "STOPPED"} onClick={() => handleAction("start", () => api.startSession(session.name))}>
                                    <Play />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Start</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-10" disabled={session.status === "STOPPED"} onClick={() => handleAction("restart", () => api.restartSession(session.name))}>
                                    <RotateCcw />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Restart</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-10" disabled={session.status === "STOPPED"} onClick={() => handleAction("stop", () => api.stopSession(session.name))}>
                                    <Square />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Stop</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-10" disabled={session.status === "STOPPED"} onClick={() => handleAction("logout", () => api.logoutSession(session.name))}>
                                    <LogOut />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Logout</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-10" onClick={() => handleAction("delete", () => api.deleteSession(session.name))}>
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
                                  <Button variant="ghost" size="icon" className="size-10" disabled={session.status !== "STOPPED"} onClick={() => handleAction("start", () => api.startSession(session.name))}>
                                    <Play />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Start</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-10" disabled={session.status === "STOPPED"} onClick={() => handleAction("stop", () => api.stopSession(session.name))}>
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
                                  <Button variant="ghost" size="icon" className="size-10" onClick={() => handleAction("delete", () => api.deleteSession(session.name))}>
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
        </div>
      </div>
    </div>
  )
}
