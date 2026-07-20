import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Search, Download, AlertTriangle, Info, AlertCircle } from "lucide-react"
import { PageLayout } from "@/components/page-layout"
import { toast } from "sonner"
import { getDashboardAuthHeader } from "@/lib/auth"

interface AuditLog {
  id: string
  action: string
  severity: string
  apiKeyId: string | null
  apiKeyName: string | null
  sessionId: string | null
  sessionName: string | null
  ipAddress: string | null
  userAgent: string | null
  method: string | null
  path: string | null
  statusCode: number | null
  metadata: string | null
  errorMessage: string | null
  createdAt: string
}

const SEVERITY_ICONS: Record<string, any> = {
  INFO: Info,
  WARN: AlertTriangle,
  ERROR: AlertCircle,
}

const SEVERITY_COLORS: Record<string, string> = {
  INFO: "bg-blue-500/10 text-blue-500",
  WARN: "bg-yellow-500/10 text-yellow-500",
  ERROR: "bg-red-500/10 text-red-500",
}

// Turns "webhook_triggered" into "Webhook triggered" for a readable summary
// line, since the audit API doesn't send a pre-formatted message field.
function describeAction(action: string): string {
  const words = action.split("_")
  return words[0].charAt(0).toUpperCase() + words[0].slice(1) + " " + words.slice(1).join(" ")
}

function formatMetadata(metadata: string | null): string | null {
  if (!metadata) return null
  try {
    return JSON.stringify(JSON.parse(metadata), null, 2)
  } catch {
    return metadata
  }
}

export function LogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [severityFilter, setSeverityFilter] = useState<string>("all")
  const [page, setPage] = useState(0)
  const [detailLog, setDetailLog] = useState<AuditLog | null>(null)
  const limit = 50

  useEffect(() => { loadLogs() }, [page, severityFilter])

  async function loadLogs() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) })
      if (severityFilter !== "all") params.set("severity", severityFilter)
      const auth = getDashboardAuthHeader()
      const res = await fetch(`/api/audit?${params}`, {
        headers: { "x-api-key": "waha", ...(auth ? { Authorization: `Basic ${auth}` } : {}) },
      })
      if (res.ok) setLogs(await res.json())
    } catch (err) { toast.error("Failed to load logs") }
    setLoading(false)
  }

  function exportLogs() {
    const csv = ["ID,Action,Severity,Session,API Key,IP,Status,Error,Created"].concat(
      logs.map(l => [
        l.id, l.action, l.severity, l.sessionName || "", l.apiKeyName || "",
        l.ipAddress || "", l.statusCode ?? "", `"${(l.errorMessage || "").replace(/"/g, '""')}"`, l.createdAt,
      ].join(","))
    ).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = "audit-logs.csv"; a.click()
    URL.revokeObjectURL(url)
    toast.success("Logs exported")
  }

  const filtered = logs.filter(l => !search ||
    l.action.toLowerCase().includes(search.toLowerCase()) ||
    (l.sessionName || "").toLowerCase().includes(search.toLowerCase()) ||
    (l.errorMessage || "").toLowerCase().includes(search.toLowerCase())
  )

  return (
    <PageLayout title="Audit Logs" description="Track all system events and API activity" actions={<Button variant="outline" onClick={exportLogs}><Download />Export CSV</Button>}>
      <div className="space-y-6">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search logs..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severities</SelectItem>
              <SelectItem value="INFO">Info</SelectItem>
              <SelectItem value="WARN">Warning</SelectItem>
              <SelectItem value="ERROR">Error</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardHeader className="pb-4"><CardTitle className="text-sm">Events ({filtered.length})</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-base text-muted-foreground">No logs found</div>
            ) : (
              <div className="space-y-1">
                {filtered.map(log => {
                  const Icon = SEVERITY_ICONS[log.severity] || Info
                  return (
                    <button
                      key={log.id}
                      onClick={() => setDetailLog(log)}
                      className="flex w-full items-center gap-3 p-2 rounded-lg hover:bg-muted/50 text-left cursor-pointer"
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <Badge className={`${SEVERITY_COLORS[log.severity] || ""} text-xs`}>{log.severity}</Badge>
                      <span className="text-xs font-mono text-muted-foreground w-[160px] shrink-0">{log.action}</span>
                      <span className="text-sm flex-1 truncate">
                        {describeAction(log.action)}
                        {log.errorMessage && <span className="text-red-500"> — {log.errorMessage}</span>}
                      </span>
                      {log.sessionName && <Badge variant="outline" className="text-xs shrink-0">{log.sessionName}</Badge>}
                      <span className="text-xs text-muted-foreground shrink-0">{new Date(log.createdAt).toLocaleTimeString()}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-between">
          <Button variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span className="text-sm text-base text-muted-foreground">Page {page + 1}</span>
          <Button variant="outline" disabled={logs.length < limit} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      </div>

      <Dialog open={!!detailLog} onOpenChange={(open) => !open && setDetailLog(null)}>
        <DialogContent className="max-w-lg">
          {detailLog && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Badge className={`${SEVERITY_COLORS[detailLog.severity] || ""} text-xs`}>{detailLog.severity}</Badge>
                  {describeAction(detailLog.action)}
                </DialogTitle>
                <DialogDescription className="font-mono text-xs">{detailLog.action}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-1.5">
                  <span className="text-muted-foreground">Time</span>
                  <span>{new Date(detailLog.createdAt).toLocaleString()}</span>
                  {detailLog.sessionName && (
                    <>
                      <span className="text-muted-foreground">Session</span>
                      <span>{detailLog.sessionName}</span>
                    </>
                  )}
                  {detailLog.apiKeyName && (
                    <>
                      <span className="text-muted-foreground">API Key</span>
                      <span>{detailLog.apiKeyName}</span>
                    </>
                  )}
                  {detailLog.ipAddress && (
                    <>
                      <span className="text-muted-foreground">IP Address</span>
                      <span className="font-mono">{detailLog.ipAddress}</span>
                    </>
                  )}
                  {detailLog.userAgent && (
                    <>
                      <span className="text-muted-foreground">User Agent</span>
                      <span className="break-all text-xs">{detailLog.userAgent}</span>
                    </>
                  )}
                  {(detailLog.method || detailLog.path) && (
                    <>
                      <span className="text-muted-foreground">Request</span>
                      <span className="font-mono text-xs">{detailLog.method} {detailLog.path}</span>
                    </>
                  )}
                  {detailLog.statusCode != null && (
                    <>
                      <span className="text-muted-foreground">Status</span>
                      <span>{detailLog.statusCode}</span>
                    </>
                  )}
                </div>
                {detailLog.errorMessage && (
                  <div>
                    <p className="text-muted-foreground mb-1">Error</p>
                    <p className="rounded-md bg-red-500/10 text-red-500 p-2 text-xs">{detailLog.errorMessage}</p>
                  </div>
                )}
                {detailLog.metadata && (
                  <div>
                    <p className="text-muted-foreground mb-1">Metadata</p>
                    <pre className="rounded-md bg-muted p-2 text-xs overflow-auto max-h-64">{formatMetadata(detailLog.metadata)}</pre>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}
