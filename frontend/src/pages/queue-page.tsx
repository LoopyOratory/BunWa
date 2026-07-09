import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RefreshCw, CheckCircle, XCircle, Clock, Loader2 } from "lucide-react"
import { PageLayout } from "@/components/page-layout"
import { toast } from "sonner"

interface QueueJob {
  id: string
  name: string
  data: any
  status: "waiting" | "active" | "completed" | "failed" | "delayed"
  progress?: number
  attemptsMade: number
  timestamp: number
  failedReason?: string
}

const STATUS_COLORS: Record<string, string> = {
  waiting: "bg-yellow-500/10 text-yellow-500",
  active: "bg-blue-500/10 text-blue-500",
  completed: "bg-green-500/10 text-green-500",
  failed: "bg-red-500/10 text-red-500",
  delayed: "bg-purple-500/10 text-purple-500",
}

const STATUS_ICONS: Record<string, any> = {
  waiting: Clock,
  active: Loader2,
  completed: CheckCircle,
  failed: XCircle,
  delayed: Clock,
}

export function QueuePage() {
  const [jobs, setJobs] = useState<QueueJob[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ total: 0, waiting: 0, active: 0, completed: 0, failed: 0 })

  useEffect(() => { loadJobs() }, [])

  async function loadJobs() {
    setLoading(true)
    try {
      const res = await fetch("/api/workers", {
        headers: { "x-api-key": localStorage.getItem("waha-api-key") || "" },
      })
      if (res.ok) {
        const workers = await res.json()
        // Workers endpoint returns worker info, not queue jobs
        // For now, show worker status as queue status
        const worker = workers[0]
        setStats({
          total: worker?.sessions || 0,
          waiting: 0,
          active: worker?.connected ? 1 : 0,
          completed: 0,
          failed: 0,
        })
        setJobs([{
          id: "main",
          name: worker?.name || "BunWa",
          data: { engine: worker?.engine, version: worker?.version },
          status: worker?.connected ? "active" : "failed",
          attemptsMade: 0,
          timestamp: Date.now(),
        }])
      }
    } catch (err) { toast.error("Failed to load queue status") }
    setLoading(false)
  }

  return (
    <PageLayout title="Queue Monitor" description="Monitor BullMQ workers and webhook delivery queue" actions={<Button variant="outline" onClick={loadJobs}><RefreshCw />Refresh</Button>}>
      <div className="space-y-6">

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm text-base text-muted-foreground">Total</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold tracking-tight">{stats.total}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm text-base text-muted-foreground">Active</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold tracking-tight text-blue-500">{stats.active}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm text-base text-muted-foreground">Waiting</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold tracking-tight text-yellow-500">{stats.waiting}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm text-base text-muted-foreground">Completed</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold tracking-tight text-green-500">{stats.completed}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm text-base text-muted-foreground">Failed</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold tracking-tight text-red-500">{stats.failed}</div></CardContent>
        </Card>
      </div>

      {/* Queue Jobs Table */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Workers</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Engine</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map(job => {
                  const Icon = STATUS_ICONS[job.status] || Clock
                  return (
                    <TableRow key={job.id}>
                      <TableCell className="font-medium">{job.name}</TableCell>
                      <TableCell><Badge variant="outline">{job.data.engine}</Badge></TableCell>
                      <TableCell className="text-base text-muted-foreground">{job.data.version}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Icon className="h-5 w-5" />
                          <Badge className={`${STATUS_COLORS[job.status]} text-xs`}>{job.status}</Badge>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      </div>
    </PageLayout>
  )
}
