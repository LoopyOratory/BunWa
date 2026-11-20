import { useEffect, useState } from "react"
import { MessageCircle, Phone } from "lucide-react"
import type { AgentEngagement } from "@/lib/agents-api"
import { cn } from "@/lib/utils"

/** Mirror of the server's engagement TTL: hide a badge whose runtime went quiet. */
const ENGAGEMENT_TTL_MS = 15_000

function formatElapsed(since: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(since)) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`
}

function engagementLabel(engaged: AgentEngagement): string {
  if (engaged.kind === "voice") return "On call"
  return engaged.contact ? `Chatting with ${engaged.contact}` : "Chatting"
}

/**
 * Live-interaction pill: "On call · 2m 14s" / "Chatting with Ama · 45s".
 * The elapsed timer ticks locally; if the runtime's heartbeat stops for
 * more than the TTL the badge hides itself, even without a server event,
 * so a crashed runtime can never pin a stale "on call" state.
 */
export function AgentEngagedBadge({
  engaged,
  onClick,
  className,
}: {
  engaged: AgentEngagement | null
  onClick?: (event: React.MouseEvent) => void
  className?: string
}) {
  const [now, setNow] = useState(() => Date.now())

  const active = Boolean(engaged && now - Date.parse(engaged.lastBeatAt) <= ENGAGEMENT_TTL_MS)

  useEffect(() => {
    if (!engaged) return
    const timer = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [engaged])

  if (!engaged || !active) return null

  const Icon = engaged.kind === "voice" ? Phone : MessageCircle
  const label = engagementLabel(engaged)
  const elapsed = formatElapsed(engaged.since, now)
  const content = (
    <>
      <span className="size-1.5 animate-pulse rounded-full bg-success" aria-hidden />
      <Icon className="size-3" strokeWidth={1.75} aria-hidden />
      <span className="max-w-44 truncate">{label}</span>
      <span className="tabular-nums opacity-75">· {elapsed}</span>
    </>
  )
  const title = `Reported by the agent runtime · clears ${ENGAGEMENT_TTL_MS / 1000}s after the last heartbeat`

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        aria-label={`${label} for ${elapsed}`}
        className={cn(
          "inline-flex max-w-full items-center gap-1.5 rounded-full border border-success-border/60 bg-success-bg px-2.5 py-1 text-[11px] font-semibold text-success-foreground transition-colors hover:border-success-foreground/40",
          className,
        )}
      >
        {content}
      </button>
    )
  }

  return (
    <span
      role="status"
      title={title}
      aria-label={`${label} for ${elapsed}`}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border border-success-border/60 bg-success-bg px-2.5 py-1 text-[11px] font-semibold text-success-foreground",
        className,
      )}
    >
      {content}
    </span>
  )
}
