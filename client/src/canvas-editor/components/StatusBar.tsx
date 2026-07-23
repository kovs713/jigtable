import { cn } from "@/lib/utils"

import type { CanvasItem, CanvasSize, EditorStatus } from "../model/types"

type StatusBarProps = {
  status: EditorStatus
  canvas: CanvasSize
  selectedItem?: CanvasItem
}

export function StatusBar({ status, canvas, selectedItem }: StatusBarProps) {
  return (
    <footer className="status-bar glass">
      <div className="status-bar__message">
        <div
          className={cn(
            "status-bar__indicator",
            status.kind === "loading"
              ? "status-bar__indicator--loading"
              : status.kind === "error"
                ? "status-bar__indicator--error"
                : "status-bar__indicator--success"
          )}
        />
        <span className="status-bar__text">{status.message}</span>
      </div>
      <div className="status-bar__meta">
        <span className="status-bar__text">
          Canvas: {canvas.width} x {canvas.height}px
        </span>
        {selectedItem ? (
          <span className="status-bar__text">
            Selection: {selectedItem.width} x {selectedItem.height}px
          </span>
        ) : null}
      </div>
    </footer>
  )
}
