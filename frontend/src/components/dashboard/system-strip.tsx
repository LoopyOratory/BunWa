import { Database, Server, Timer, Cpu } from "lucide-react"
import type { DashboardSummary } from "@/lib/api"
import { uptimeLabel } from "@/lib/time"
import { cn } from "@/lib/utils"

/**
 * One line of server facts: version, store health, uptime, workers. It
 * replaces the Workers stat card, the "Workers load" chart and the workers
 * table, which all described the same single process.
 */
export function SystemStrip({ server }: { server: DashboardSummary["server"] }) {
  const store = server.store
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <Server className="size-3.5" strokeWidth={1.75} />
        <span className="metric text-foreground">{server.version}</span>
        <span>{server.tier}</span>
      </span>
      <span
        className={cn("inline-flex items-center gap-1.5", !store.ok && "text-error-foreground")}
        title={store.error}
      >
        <Database className="size-3.5" strokeWidth={1.75} />
        {store.driver === "postgres" ? "Postgres" : "SQLite"} store {store.ok ? "ok" : "unreachable"}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Timer className="size-3.5" strokeWidth={1.75} />
        up <span className="metric text-foreground">{uptimeLabel(server.uptimeSeconds)}</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Cpu className="size-3.5" strokeWidth={1.75} />
        <span className="metric text-foreground">{server.workers}</span> worker{server.workers === 1 ? "" : "s"}
      </span>
    </div>
  )
}
