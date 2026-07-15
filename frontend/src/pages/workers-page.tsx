import { useEffect, useState, useCallback } from "react"
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
  CheckCircle,
  XCircle,
  Link2,
  Search,
  Server,
  RefreshCw,
} from "lucide-react"
import { api, type Worker } from "@/lib/api"
import { PageLayout } from "@/components/page-layout"

let workersFailedOnce = false

export function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([])
  const [search, setSearch] = useState("")

  const load = useCallback(async () => {
    if (workersFailedOnce) return
    try {
      const w = await api.getWorkers()
      setWorkers(w)
    } catch {
      workersFailedOnce = true
      const v = await api.getVersion().catch(() => null)
      const sessions = await api.getSessions().catch(() => [])
      setWorkers([{
        name: "BunWa",
        apiUrl: window.location.origin,
        engine: v?.engine || "NOWEB",
        version: v?.version || "",
        tier: v?.tier || "",
        uptime: "00:00:00",
        sessions: sessions.length,
        connected: true,
      }])
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 10000)
    return () => clearInterval(interval)
  }, [load])

  const filtered = workers.filter((w) =>
    !search || w.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <PageLayout
      title="Workers"
      description="Connected WhatsApp API worker instances"
      actions={
        <Button variant="ghost" size="icon" onClick={load} title="Refresh">
          <RefreshCw />
        </Button>
      }
    >
      <div className="space-y-6">
          <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Workers</CardTitle>
                <Server className="size-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold tracking-tight">{workers.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Connected</CardTitle>
                <CheckCircle className="size-5 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold tracking-tight text-green-500">
                  {workers.filter((w) => w.connected).length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Disconnected</CardTitle>
                <XCircle className="size-5 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold tracking-tight text-destructive">
                  {workers.filter((w) => !w.connected).length}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <Server className="size-5" />
                Worker Instances
              </CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search workers..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-8 w-full sm:w-56 pl-8 text-xs"
                  />
                </div>
                <Button variant="outline" size="sm">
                  <Link2 className="size-5" />
                  <span className="hidden sm:inline ml-1">Connect</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden sm:table-cell">API URL</TableHead>
                      <TableHead>Engine</TableHead>
                      <TableHead className="hidden md:table-cell">Version</TableHead>
                      <TableHead className="hidden md:table-cell">Sessions</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center text-base text-muted-foreground">
                          No workers found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((worker) => (
                        <TableRow key={worker.name}>
                          <TableCell className="font-medium">{worker.name}</TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <a href={worker.apiUrl} target="_blank" rel="noopener noreferrer" className="hover:underline text-xs">
                              {worker.apiUrl}
                            </a>
                          </TableCell>
                          <TableCell>
                            <code className="rounded bg-muted px-1 py-0.5 text-xs">{worker.engine}</code>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <div className="flex items-center gap-1.5">
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
                            <Badge variant="secondary">{worker.sessions}</Badge>
                          </TableCell>
                          <TableCell>
                            {worker.connected ? (
                              <Badge variant="default" className="bg-green-600">
                                <CheckCircle className="mr-1 size-3" />
                                Connected
                              </Badge>
                            ) : (
                              <Badge variant="destructive">
                                <XCircle className="mr-1 size-3" />
                                Disconnected
                              </Badge>
                            )}
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
    </PageLayout>
  )
}
