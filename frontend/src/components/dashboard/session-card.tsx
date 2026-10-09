import {
  Cog,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Play,
  QrCode,
  RotateCcw,
  Smartphone,
  Square,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EngineBadge, Metric, StatusBadge } from "@/components/primitives"
import type { DashboardSession, LimitGauge } from "@/lib/api"
import { shortDuration, timeAgo } from "@/lib/time"
import { cn } from "@/lib/utils"
import { sessionSeverity } from "@/lib/session-severity"

export type SessionAction =
  | "start"
  | "stop"
  | "restart"
  | "logout"
  | "delete"
  | "qr"
  | "chat"
  | "settings"
  | "screenshot"

function LimitBar({ gauge, caption }: { gauge: LimitGauge; caption?: string }) {
  const pct = Math.min(100, Math.round(gauge.ratio * 100))
  const tone = gauge.ratio >= 1 ? "bg-error" : gauge.ratio >= 0.8 ? "bg-warning" : "bg-success"
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <span className="first-letter:uppercase">{gauge.label}</span>
        <span>
          <Metric className="text-foreground">{gauge.used}</Metric>/<Metric>{gauge.cap}</Metric>
          {caption && <span className="ms-1">{caption}</span>}
        </span>
      </div>
      <div
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label={gauge.label}
        aria-valuemin={0}
        aria-valuemax={gauge.cap}
        aria-valuenow={gauge.used}
      >
        <div className={cn("h-full rounded-full transition-[width]", tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function PrimaryAction({ session, onAction }: { session: DashboardSession; onAction: (a: SessionAction) => void }) {
  switch (session.status) {
    case "SCAN_QR_CODE":
      return (
        <Button size="sm" onClick={() => onAction("qr")}>
          <QrCode className="size-4" strokeWidth={1.75} />
          Show QR
        </Button>
      )
    case "STOPPED":
      return (
        <Button size="sm" variant="outline" onClick={() => onAction("start")}>
          <Play className="size-4" strokeWidth={1.75} />
          Start
        </Button>
      )
    case "FAILED":
      return (
        <Button size="sm" onClick={() => onAction("restart")}>
          <RotateCcw className="size-4" strokeWidth={1.75} />
          Restart
        </Button>
      )
    case "WORKING":
      return (
        <Button size="icon" variant="ghost" className="size-8" onClick={() => onAction("chat")} aria-label={`Open chat for ${session.name}`}>
          <MessageCircle className="size-4" strokeWidth={1.75} />
        </Button>
      )
    default:
      return null
  }
}

export function SessionCard({
  session,
  now,
  onAction,
}: {
  session: DashboardSession
  now: number
  onAction: (action: SessionAction) => void
}) {
  const severity = sessionSeverity(session)
  const since = session.statusSince ? shortDuration(now - Date.parse(session.statusSince)) : null
  const limits = session.limits
  const stopped = session.status === "STOPPED"

  return (
    <article
      className={cn(
        // glass-card paints its own hairline, so the severity edge is an outline.
        "glass-card flex flex-col gap-3 rounded-lg p-4 -outline-offset-1",
        severity === 2 ? "outline-2 outline-error-border" : severity === 1 ? "outline-2 outline-warning-border" : "",
      )}
      aria-label={`Session ${session.name}`}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-heading text-base font-semibold">{session.name}</h3>
          <p className="truncate text-xs text-muted-foreground">
            {session.account ? (
              <>
                {session.account.pushName && <span className="text-foreground">{session.account.pushName} · </span>}
                <Metric>{session.account.id.split("@")[0]}</Metric>
              </>
            ) : (
              "No account linked"
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <StatusBadge status={session.status} />
          {since && <span className="metric text-xs text-muted-foreground">{since}</span>}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <EngineBadge engine={session.engine} />
        {session.lastActivityAt && <span>active {timeAgo(session.lastActivityAt, now)}</span>}
      </div>

      {limits?.enabled ? (
        <div className="space-y-2">
          {/* The volume cap closest to full (minute, hour or day), then the
              new-chat quota, which is always shown on its own bar. */}
          <LimitBar
            gauge={
              limits.nearest &&
              limits.nearest.label !== limits.newChats.label &&
              limits.nearest.ratio > limits.day.ratio
                ? limits.nearest
                : limits.day
            }
          />
          <LimitBar gauge={limits.newChats} />
          <p className="text-xs text-muted-foreground">
            {limits.warmup.done
              ? "Warm-up done"
              : `Warm-up day ${Math.max(1, Math.ceil(limits.warmup.ageDays))} of ${limits.warmup.warmupDays}`}
            {limits.quietHoursUntil && (
              <span className="text-warning-foreground"> · quiet hours until {new Date(limits.quietHoursUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            )}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{limits ? "Sending limits are off for this session" : "No sending limits data"}</p>
      )}

      <footer className="mt-auto flex items-center justify-between gap-2 border-t border-border/50 pt-3">
        <p className="text-xs text-muted-foreground">
          <Metric className="text-foreground">{session.counts.sent}</Metric> sent
          {session.counts.failed > 0 && (
            <span className="text-error-foreground"> · <Metric>{session.counts.failed}</Metric> failed</span>
          )}
          {session.counts.webhookFailed > 0 && (
            <span className="text-error-foreground"> · <Metric>{session.counts.webhookFailed}</Metric> webhook failures</span>
          )}
        </p>
        <div className="flex items-center gap-1">
          <PrimaryAction session={session} onAction={onAction} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" aria-label={`More actions for ${session.name}`}>
                <MoreHorizontal className="size-4" strokeWidth={1.75} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem disabled={!stopped} onSelect={() => onAction("start")}>
                <Play strokeWidth={1.75} />
                Start
              </DropdownMenuItem>
              <DropdownMenuItem disabled={stopped} onSelect={() => onAction("restart")}>
                <RotateCcw strokeWidth={1.75} />
                Restart
              </DropdownMenuItem>
              <DropdownMenuItem disabled={stopped} onSelect={() => onAction("stop")}>
                <Square strokeWidth={1.75} />
                Stop
              </DropdownMenuItem>
              <DropdownMenuItem disabled={session.status !== "SCAN_QR_CODE"} onSelect={() => onAction("qr")}>
                <QrCode strokeWidth={1.75} />
                QR and pairing
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={session.status !== "WORKING" || session.engine !== "WEBJS"}
                onSelect={() => onAction("screenshot")}
              >
                <Smartphone strokeWidth={1.75} />
                Screenshot
              </DropdownMenuItem>
              <DropdownMenuItem disabled={session.status !== "WORKING"} onSelect={() => onAction("chat")}>
                <MessageCircle strokeWidth={1.75} />
                Chat
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAction("settings")}>
                <Cog strokeWidth={1.75} />
                Settings and limits
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={stopped} onSelect={() => onAction("logout")}>
                <LogOut strokeWidth={1.75} />
                Log out
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => onAction("delete")}>
                <Trash2 strokeWidth={1.75} />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </footer>
    </article>
  )
}
