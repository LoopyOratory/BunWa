"use client"

import * as React from "react"
import { Separator as SeparatorPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "shrink-0 bg-gradient-to-r from-transparent via-border to-transparent data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch data-vertical:bg-gradient-to-b",
        orientation === "vertical" && "bg-gradient-to-b",
        className
      )}
      {...props}
    />
  )
}

export { Separator }
