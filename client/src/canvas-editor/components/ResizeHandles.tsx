import type { PointerEvent } from "react"

import { cn } from "@/lib/utils"

import {
  RESIZE_CORNER_HOVER_BORDER_CLASS,
  RESIZE_CORNER_SELECTED_BORDER_CLASS,
  RESIZE_EDGE_HOVER_BORDER_CLASS,
  RESIZE_EDGE_SELECTED_BORDER_CLASS,
  RESIZE_HANDLE_COLOR_CLASS,
  RESIZE_HANDLES,
} from "../model/constants"
import type { ResizeEdge } from "../model/types"

type ResizeHandlesProps = {
  active: boolean
  labelPrefix: string
  selected?: boolean
  variant?: "default" | "canvas"
  onPointerDown: (event: PointerEvent, edge: ResizeEdge) => void
}

export function ResizeHandles({
  active,
  labelPrefix,
  selected = false,
  variant = "default",
  onPointerDown,
}: ResizeHandlesProps) {
  return RESIZE_HANDLES.map((handle) => {
    const isCanvasHandle = variant === "canvas"
    return (
      <button
        key={handle.edge}
        aria-label={`${labelPrefix}: ${handle.label}`}
        className={cn(
          "pointer-events-auto absolute z-1000 bg-transparent opacity-0 transition-opacity outline-none group-hover:opacity-100 focus-visible:opacity-100",
          active && "opacity-100",
          isCanvasHandle && "canvas-resize-handle",
          handle.className
        )}
        data-edge={handle.edge}
        data-handle-type={handle.type}
        type="button"
        onPointerDown={(event) => onPointerDown(event, handle.edge)}
      >
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute box-border",
            isCanvasHandle
              ? "canvas-resize-handle__indicator"
              : cn(
                  RESIZE_HANDLE_COLOR_CLASS,
                  selected
                    ? handle.type === "edge"
                      ? RESIZE_EDGE_SELECTED_BORDER_CLASS
                      : RESIZE_CORNER_SELECTED_BORDER_CLASS
                    : handle.type === "edge"
                      ? RESIZE_EDGE_HOVER_BORDER_CLASS
                      : RESIZE_CORNER_HOVER_BORDER_CLASS
                ),
            handle.indicatorClassName
          )}
        />
      </button>
    )
  })
}
