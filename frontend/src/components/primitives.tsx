// BunWa console primitives — the single source of truth for status, states and
// repeated layout shapes used across all routes.
//
// Status vocabulary (mapSessionStatus, mapSeverity, StatusKind) lives in
// `@/lib/status` so this module exports components only.
//
// Rules for consumers:
//   - Status colour comes from <StatusBadge> / <SeverityBadge> / <EngineBadge>,
//     never from raw Tailwind palettes (emerald-500, amber-500, red-500).
//   - Numbers that update or align in columns use <Metric> (tabular digits).
//   - Tables sit inside <DataTable> so every table shares one shell.
//   - Every data view provides loading (skeleton), empty and error states.
import type { ReactNode, Ref } from "react"
import { AppWindow, RotateCw, TriangleAlert, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Table } from "@/components/ui/table"
import { STATUS_LABEL, mapSessionStatus, mapSeverity, type StatusKind, type Severity } from "@/lib/status"

/* ── StatusBadge: semantic session/worker status ─────────────────────── */
export function StatusBadge({ status, kind }: { status?: string; kind?: StatusKind }) {
  const k = kind ?? mapSessionStatus(status)
  return (
    <span className={cn("status-badge", `status-${k}`)}>
      <span className={cn("status-dot", `status-dot-${k}`)} />
      {STATUS_LABEL[k]}
    </span>
  )
}

/* ── EngineBadge: NOWEB / WEBJS, defined once ─────────────────────────── */
export function EngineBadge({ engine, className }: { engine?: string; className?: string }) {
  const isWebjs = (engine || "").toUpperCase() === "WEBJS"
  const Icon = isWebjs ? AppWindow : Zap
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/60 px-2 py-0.5 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      <Icon className="size-3.5" strokeWidth={1.75} />
      {isWebjs ? "WEBJS" : "NOWEB"}
    </span>
  )
}

/* ── SeverityBadge: audit log rows ────────────────────────────────────── */
const SEVERITY_CLASS: Record<Severity, string> = {
  info: "border-border bg-muted text-muted-foreground",
  warn: "border-warning-border bg-warning-bg text-warning-foreground",
  error: "border-error-border bg-error-bg text-error-foreground",
}

export function SeverityBadge({ severity }: { severity?: string }) {
  const k = mapSeverity(severity)
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize",
        SEVERITY_CLASS[k],
      )}
    >
      {k}
    </span>
  )
}

/* ── Metric: digits that do not jitter ───────────────────────────────── */
export function Metric({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("metric", className)}>{children}</span>
}

/* ── StatCard: one shape for every stat row in the console ───────────── */
const STAT_TONE: Record<string, string> = {
  neutral: "text-foreground",
  success: "text-success-foreground",
  warning: "text-warning-foreground",
  error: "text-error-foreground",
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  tone?: keyof typeof STAT_TONE
}) {
  return (
    <div className="stat-card rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {icon && <span className="icon-chip size-8 [&>svg]:size-4">{icon}</span>}
      </div>
      <p className={cn("metric mt-2 font-heading text-2xl font-semibold leading-none", STAT_TONE[tone])}>
        {value}
      </p>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/* ── DataTable: one table shell for the whole console ─────────────────── */
export function DataTable({
  children,
  className,
  minWidthClassName = "min-w-[720px]",
  scrollRef,
}: {
  children: ReactNode
  className?: string
  minWidthClassName?: string | false
  /** Attach to the scrolling element, e.g. to follow a live event stream. */
  scrollRef?: Ref<HTMLDivElement>
}) {
  return (
    <div className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}>
      <div ref={scrollRef} className="overflow-x-auto">
        <Table className={minWidthClassName === false ? undefined : minWidthClassName}>
          {children}
        </Table>
      </div>
    </div>
  )
}

/* ── Skeleton loaders: shaped like the content they stand in for ─────── */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-muted", className)} />
}

export function StatRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-3 h-7 w-16" />
        </div>
      ))}
    </div>
  )
}

export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-4 py-3">
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton key={c} className={cn("h-4", c === 0 ? "w-40" : c === columns - 1 ? "w-16" : "w-24")} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="card-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-4 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-2/3" />
          <Skeleton className="mt-6 h-9 w-28" />
        </div>
      ))}
    </div>
  )
}

/* ── EmptyState: composed getting-started view ───────────────────────── */
export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <div className={cn("empty-state", compact && "py-10")}>
      <div className={cn("icon-chip", compact ? "size-10 [&>svg]:size-5" : "size-12 [&>svg]:size-6")}>{icon}</div>
      <div>
        <p className="font-medium text-foreground">{title}</p>
        {description && (
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}

/* ── ErrorState: inline failure with a way forward ───────────────────── */
export function ErrorState({
  title = "Could not load this view",
  description,
  onRetry,
  action,
  compact = false,
}: {
  title?: string
  description?: ReactNode
  onRetry?: () => void
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-error-border bg-error-bg/60 px-6 text-center",
        compact ? "py-8" : "py-12",
      )}
    >
      <TriangleAlert className="size-5 text-error-foreground" strokeWidth={1.75} />
      <div>
        <p className="font-medium text-foreground">{title}</p>
        {description && (
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCw className="size-4" strokeWidth={1.75} />
            Retry
          </Button>
        )}
        {action}
      </div>
    </div>
  )
}

/* ── SectionHeading: consistent section titles inside a page ─────────── */
export function SectionHeading({
  title,
  description,
  action,
  className,
}: {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <div>
        <h2 className="font-heading text-base font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}
