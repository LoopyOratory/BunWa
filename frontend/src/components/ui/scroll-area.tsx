import * as React from "react"
import { cn } from "@/lib/utils"

interface ScrollAreaProps extends React.ComponentProps<"div"> {
  viewportRef?: React.RefObject<HTMLDivElement | null>
}

function ScrollArea({ className, children, viewportRef, ...props }: ScrollAreaProps) {
  return (
    <div
      className={cn("relative overflow-auto", className)}
      {...props}
    >
      <div ref={viewportRef} className="h-full min-h-0">
        {children}
      </div>
    </div>
  )
}

export { ScrollArea }
