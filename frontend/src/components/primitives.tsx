// BunWa UI v2 shared primitives — used across all routes
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/* ── StatusBadge: semantic session/worker status ─────────────────────── */
export type StatusKind = "working" | "starting" | "stopped" | "failed"

const STATUS_LABEL: Record<StatusKind, string> = {
  working: "Working",
  starting: "Starting",
  stopped: "Stopped",
  failed: "Failed",
}

export function mapSessionStatus(status?: string): StatusKind {
  const s = (status || "").toLowerCase()
  if (["working", "connected"].includes(s)) return "working"
  if (["starting", "scan_qr_code", "pairing", "initializing"].includes(s)) return "starting"
  if (["failed", "error"].includes(s)) return "failed"
  return "stopped"
}

export function StatusBadge({ status, kind }: { status?: string; kind?: StatusKind }) {
  const k = kind ?? mapSessionStatus(status)
  return (
    <span className={cn("status-badge", `status-${k}`)}>
      <span className={cn("status-dot", `status-dot-${k}`)} />
      {STATUS_LABEL[k]}
    </span>
  )
}

/* ── EmptyState: composed getting-started view ───────────────────────── */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <div className="icon-chip size-12 [&>svg]:size-6">{icon}</div>
      <div>
        <p className="font-semibold">{title}</p>
        {description && <p className="mt-1 text-sm text-muted-foreground max-w-sm">{description}</p>}
      </div>
      {action}
    </div>
  )
}
