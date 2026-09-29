import { cn } from "@/lib/utils"

// A warm light sweeps across the placeholder (.skeleton-shimmer in index.css)
// instead of the old opacity pulse: reads as "loading", not "broken".
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("skeleton-shimmer rounded-md", className)}
      {...props}
    />
  )
}

export { Skeleton }
