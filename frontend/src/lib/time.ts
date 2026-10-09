/** Compact duration: "now", "12m", "4h", "2d". */
export function shortDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 60_000) return "now"
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", or "" without a time. */
export function timeAgo(value: string | number | null | undefined, now = Date.now()): string {
  if (value === null || value === undefined || value === "") return ""
  const at = typeof value === "number" ? value : Date.parse(value)
  if (!Number.isFinite(at)) return ""
  const minutes = Math.round(Math.max(0, now - at) / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.round(hours / 24)} days ago`
}

/** Seconds to "3d 4h", "5h 12m", "8m". */
export function uptimeLabel(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  return `${Math.max(0, minutes)}m`
}
