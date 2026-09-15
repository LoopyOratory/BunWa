import { useEffect, useState, useCallback } from "react"
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
  CheckCircle,
  XCircle,
  Search,
  Server,
  RefreshCw,
} from "lucide-react"
import { api, type Worker } from "@/lib/api"
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

export function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const w = await api.getWorkers()
      setWorkers(w)
      setError(null)
    } catch {
      setError("Could not load workers from the API.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 10000)
    return () => clearInterval(interval)
  }, [load])

  const connectedCount = workers.filter((w) => w.connected).length
  const disconnectedCount = workers.length - connectedCount

  const filtered = workers.filter((w) =>
    !search || w.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <PageLayout
      title="Workers"
      description="Connected WhatsApp API worker instances"
      actions={
        <Button variant="ghost" size="icon" onClick={load} title="Refresh" aria-label="Refresh">
          <RefreshCw className="size-4" strokeWidth={1.75} />
        </Button>
      }
    >
      {loading ? (
        <div className="space-y-6">
          <StatRowSkeleton count={3} />
          <TableSkeleton rows={4} columns={6} />
        </div>
      ) : error ? (
        <ErrorState
          title="Could not load workers"
          description={error}
          onRetry={load}
        />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3">
            <StatCard
              label="Total workers"
              value={String(workers.length)}
              icon={<Server strokeWidth={1.75} />}
            />
            <StatCard
              label="Connected"
              value={String(connectedCount)}
              tone={connectedCount > 0 ? "success" : "neutral"}
              hint={
                workers.length > 0 ? (
                  <>
                    <Metric>{connectedCount}</Metric> of <Metric>{workers.length}</Metric> reporting
                  </>
                ) : undefined
              }
              icon={<CheckCircle strokeWidth={1.75} />}
            />
            <StatCard
              label="Disconnected"
              value={String(disconnectedCount)}
              tone={disconnectedCount > 0 ? "error" : "neutral"}
              icon={<XCircle strokeWidth={1.75} />}
            />
          </div>

          <section className="space-y-3">
            <SectionHeading
              title="Worker instances"
              description="Every instance this server knows about"
              action={
                <div className="relative">
                  <Search
                    className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    strokeWidth={1.75}
                  />
                  <Input
                    placeholder="Search workers"
                    aria-label="Search workers"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-8 w-full pl-8 text-xs sm:w-56"
                  />
                </div>
              }
            />

            {workers.length === 0 ? (
              <EmptyState
                icon={<Server strokeWidth={1.75} />}
                title="No workers found"
                description="No worker instance has registered with this server."
                action={
                  <Button variant="outline" size="sm" onClick={load}>
                    <RefreshCw className="size-4" strokeWidth={1.75} />
                    Refresh
                  </Button>
                }
              />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={<Search strokeWidth={1.75} />}
                title="No matching workers"
                description="Adjust the search text to see more."
                action={
                  <Button variant="outline" size="sm" onClick={() => setSearch("")}>
                    Clear search
                  </Button>
                }
              />
            ) : (
              <DataTable>
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
                  {filtered.map((worker) => (
                    <TableRow key={worker.name}>
                      <TableCell className="font-medium">{worker.name}</TableCell>
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
                        <EngineBadge engine={worker.engine} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-xs text-muted-foreground">
                          <Metric>{worker.version || "-"}</Metric>
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="secondary">
                          <Metric>{worker.sessions}</Metric>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge kind={worker.connected ? "working" : "failed"} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </DataTable>
            )}
          </section>
        </div>
      )}
    </PageLayout>
  )
}
