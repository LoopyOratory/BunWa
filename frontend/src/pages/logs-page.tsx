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
import { Download, Search, ScrollText } from "lucide-react"
import { PageLayout } from "@/components/page-layout"
import { toast } from "sonner"
import { getApiAuthHeaders } from "@/lib/api"
import {
  EmptyState,
  ErrorState,
  Metric,
  SeverityBadge,
  TableSkeleton,
} from "@/components/primitives"

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
  const [error, setError] = useState<string | null>(null)
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
      const res = await fetch(`/api/audit?${params}`, { headers: getApiAuthHeaders() })
      if (!res.ok) throw new Error(`The audit API answered with status ${res.status}.`)
      setLogs(await res.json())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load audit logs.")
    } finally {
      setLoading(false)
    }
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
    <PageLayout
      title="Audit logs"
      description="Track all system events and API activity"
      actions={
        <Button variant="outline" onClick={exportLogs}>
          <Download strokeWidth={1.75} />
          Export CSV
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              strokeWidth={1.75}
            />
            <Input
              className="pl-9"
              placeholder="Search logs"
              aria-label="Search logs"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-[140px]" aria-label="Filter by severity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              <SelectItem value="INFO">Info</SelectItem>
              <SelectItem value="WARN">Warning</SelectItem>
              <SelectItem value="ERROR">Error</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {error ? (
          <ErrorState
            title="Could not load audit logs"
            description={error}
            onRetry={loadLogs}
          />
        ) : loading ? (
          <TableSkeleton rows={6} columns={4} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<ScrollText strokeWidth={1.75} />}
            title="No logs found"
            description={
              search || severityFilter !== "all"
                ? "No audit events match the current search and severity filter."
                : "The audit trail is empty. Events appear here as soon as the API is used."
            }
            action={
              (search || severityFilter !== "all") ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch("")
                    setSeverityFilter("all")
                  }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <Card className="rounded-lg">
              <CardHeader className="pb-4">
                <CardTitle className="text-sm">
                  Events (<Metric>{filtered.length}</Metric>)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {filtered.map(log => (
                    <button
                      key={log.id}
                      onClick={() => setDetailLog(log)}
                      className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-muted/50"
                    >
                      <SeverityBadge severity={log.severity} />
                      <span className="hidden w-[160px] shrink-0 font-mono text-xs text-muted-foreground sm:block">
                        {log.action}
                      </span>
                      <span className="flex-1 truncate text-sm">
                        {describeAction(log.action)}
                        {log.errorMessage && <span className="text-error-foreground">: {log.errorMessage}</span>}
                      </span>
                      {log.sessionName && (
                        <Badge variant="outline" className="shrink-0">{log.sessionName}</Badge>
                      )}
                      <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                        <Metric>{new Date(log.createdAt).toLocaleTimeString()}</Metric>
                      </span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page <Metric>{page + 1}</Metric>
              </span>
              <Button variant="outline" size="sm" disabled={logs.length < limit} onClick={() => setPage(p => p + 1)}>
                Next
              </Button>
            </div>
          </>
        )}
      </div>

      <Dialog open={!!detailLog} onOpenChange={(open) => !open && setDetailLog(null)}>
        <DialogContent className="max-w-lg">
          {detailLog && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <SeverityBadge severity={detailLog.severity} />
                  {describeAction(detailLog.action)}
                </DialogTitle>
                <DialogDescription className="font-mono text-xs">{detailLog.action}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-1.5">
                  <span className="text-muted-foreground">Time</span>
                  <span><Metric>{new Date(detailLog.createdAt).toLocaleString()}</Metric></span>
                  {detailLog.sessionName && (
                    <>
                      <span className="text-muted-foreground">Session</span>
                      <span>{detailLog.sessionName}</span>
                    </>
                  )}
                  {detailLog.apiKeyName && (
                    <>
                      <span className="text-muted-foreground">API key</span>
                      <span>{detailLog.apiKeyName}</span>
                    </>
                  )}
                  {detailLog.ipAddress && (
                    <>
                      <span className="text-muted-foreground">IP address</span>
                      <span className="font-mono"><Metric>{detailLog.ipAddress}</Metric></span>
                    </>
                  )}
                  {detailLog.userAgent && (
                    <>
                      <span className="text-muted-foreground">User agent</span>
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
                      <span><Metric>{detailLog.statusCode}</Metric></span>
                    </>
                  )}
                </div>
                {detailLog.errorMessage && (
                  <div>
                    <p className="mb-1 text-muted-foreground">Error</p>
                    <p className="rounded-md border border-error-border bg-error-bg p-2 text-xs text-error-foreground">
                      {detailLog.errorMessage}
                    </p>
                  </div>
                )}
                {detailLog.metadata && (
                  <div>
                    <p className="mb-1 text-muted-foreground">Metadata</p>
                    <pre className="max-h-64 overflow-auto rounded-md bg-muted p-2 text-xs">{formatMetadata(detailLog.metadata)}</pre>
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
