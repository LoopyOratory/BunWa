import type { DashboardSession } from "@/lib/api"

/**
 * How urgently a session needs the operator: 2 = act now (QR, failed, cap
 * reached), 1 = watch (near a cap, webhook failures), 0 = fine. Cards sort by
 * it and colour their edge with it.
 */
export function sessionSeverity(session: DashboardSession): 0 | 1 | 2 {
  if (session.status === "SCAN_QR_CODE" || session.status === "FAILED") return 2
  const ratio = session.limits?.enabled ? (session.limits.nearest?.ratio ?? 0) : 0
  if (ratio >= 1) return 2
  if (ratio >= 0.8 || session.counts.webhookFailed > 0) return 1
  return 0
}
