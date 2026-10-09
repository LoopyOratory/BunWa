// Status vocabulary shared by badges, dots and tables.
//
// These mappers live outside `components/primitives.tsx` on purpose: that module
// must export components only, otherwise React Fast Refresh gives up on it.

export type StatusKind = "working" | "starting" | "qr" | "stopped" | "failed"

export const STATUS_LABEL: Record<StatusKind, string> = {
  working: "Working",
  starting: "Starting",
  qr: "Needs QR",
  stopped: "Stopped",
  failed: "Failed",
}

export function mapSessionStatus(status?: string): StatusKind {
  const s = (status || "").toLowerCase()
  if (["working", "connected"].includes(s)) return "working"
  // Waiting for a QR scan needs the operator, unlike a session that is still starting.
  if (["scan_qr_code", "pairing"].includes(s)) return "qr"
  if (["starting", "initializing"].includes(s)) return "starting"
  if (["failed", "error"].includes(s)) return "failed"
  return "stopped"
}

export type Severity = "info" | "warn" | "error"

export function mapSeverity(severity?: string): Severity {
  const s = (severity || "").toLowerCase()
  if (s === "warn" || s === "warning") return "warn"
  if (s === "error" || s === "fatal" || s === "critical") return "error"
  return "info"
}

/** Tailwind classes for a status dot, keyed by the mapped status kind. */
export const STATUS_DOT_CLASS: Record<StatusKind, string> = {
  working: "bg-success",
  starting: "bg-warning",
  qr: "bg-error",
  stopped: "bg-muted-foreground/60",
  failed: "bg-error",
}
