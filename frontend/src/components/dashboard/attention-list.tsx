import { CircleCheck, OctagonAlert, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { AttentionItem } from "@/lib/api"
import { cn } from "@/lib/utils"

const ACTION_LABEL: Record<AttentionItem["action"], string> = {
  qr: "Show QR",
  start: "Start",
  restart: "Restart",
  limits: "Limits",
  webhooks: "Webhooks",
  logs: "Details",
}

const KIND_LABEL: Record<AttentionItem["kind"], string> = {
  session: "Session",
  limit: "Limit",
  webhook: "Webhook",
  sends: "Sends",
}

/**
 * What needs the operator now, worst first. Collapses to one calm line when
 * nothing does, so the page never shouts without a reason.
 */
export function AttentionList({
  items,
  onAction,
}: {
  items: AttentionItem[]
  onAction: (item: AttentionItem) => void
}) {
  if (items.length === 0) {
    return (
      <div className="glass-card flex items-center gap-2 rounded-lg px-4 py-3 text-sm">
        <CircleCheck className="size-4 text-success-foreground" strokeWidth={1.75} />
        <span className="font-medium text-success-foreground">All sessions healthy</span>
        <span className="text-muted-foreground">Nothing needs your attention.</span>
      </div>
    )
  }

  const hasError = items.some((item) => item.severity === "error")
  return (
    <section
      aria-labelledby="attention-heading"
      className={cn(
        // glass-card paints its own hairline, so the severity edge is an outline.
        "glass-card rounded-lg p-4 outline-2 -outline-offset-1",
        hasError ? "outline-error-border" : "outline-warning-border",
      )}
    >
      <h2 id="attention-heading" className="mb-2 flex items-center gap-2 font-heading text-sm font-semibold">
        {hasError ? (
          <OctagonAlert className="size-4 text-error-foreground" strokeWidth={1.75} />
        ) : (
          <TriangleAlert className="size-4 text-warning-foreground" strokeWidth={1.75} />
        )}
        Needs attention
        <span className="metric text-muted-foreground">{items.length}</span>
      </h2>
      <ul className="divide-y divide-border/60">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <span
              className={cn(
                "inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                item.severity === "error"
                  ? "border-error-border bg-error-bg text-error-foreground"
                  : "border-warning-border bg-warning-bg text-warning-foreground",
              )}
            >
              {KIND_LABEL[item.kind]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium sm:line-clamp-1">{item.title}</p>
              <p className="line-clamp-2 text-xs text-muted-foreground sm:line-clamp-1">{item.detail}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => onAction(item)}>
              {ACTION_LABEL[item.action]}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
