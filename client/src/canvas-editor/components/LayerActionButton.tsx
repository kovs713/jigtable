import type { ButtonHTMLAttributes } from "react"
import { forwardRef } from "react"

import { cn } from "@/lib/utils"

export const LayerActionButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "flex items-center justify-center p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-30 disabled:hover:bg-transparent",
      className
    )}
    type="button"
    {...props}
  />
))
LayerActionButton.displayName = "LayerActionButton"
