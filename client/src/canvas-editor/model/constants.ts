import type { AspectRatioPreset, CanvasLayout, ResizeHandle } from "./types"

export const MIN_ITEM_SIZE = 32
export const MIN_CANVAS_SIZE = 120
export const MAX_CANVAS_SIZE = 2000
export const DEFAULT_ZOOM = 42
export const MOVE_DRAG_THRESHOLD = 4
export const IMAGE_MARKER_COUNT = 20
export const HISTORY_LIMIT = 200

export const RESIZE_EDGE_HOVER_BORDER_CLASS = "border"
export const RESIZE_CORNER_HOVER_BORDER_CLASS = "border"
export const RESIZE_EDGE_SELECTED_BORDER_CLASS = "border-2"
export const RESIZE_CORNER_SELECTED_BORDER_CLASS = "border-2"
export const RESIZE_HANDLE_COLOR_CLASS =
  "border-[var(--image-marker)] bg-[var(--image-marker)]"

export const ASPECT_RATIO_PRESETS: AspectRatioPreset[] = [
  { label: "1:1", width: 1, height: 1 },
  { label: "4:5", width: 4, height: 5 },
  { label: "3:4", width: 3, height: 4 },
  { label: "4:3", width: 4, height: 3 },
  { label: "16:9", width: 16, height: 9 },
  { label: "9:16", width: 9, height: 16 },
]

export const RESIZE_HANDLES: ResizeHandle[] = [
  {
    edge: "n",
    label: "Resize top edge",
    className: "-top-1.5 left-1/2 h-3 w-10 -translate-x-1/2 cursor-n-resize",
    indicatorClassName: "top-1 right-2 left-2 h-0.5",
    type: "edge",
  },
  {
    edge: "ne",
    label: "Resize top right corner",
    className: "-top-1.5 -right-1.5 size-3 cursor-nesw-resize",
    indicatorClassName: "top-0.5 right-0.5 size-2",
    type: "corner",
  },
  {
    edge: "e",
    label: "Resize right edge",
    className: "top-1/2 -right-1.5 h-10 w-3 -translate-y-1/2 cursor-e-resize",
    indicatorClassName: "top-2 bottom-2 left-1/2 w-0.5 -translate-x-1/2",
    type: "edge",
  },
  {
    edge: "se",
    label: "Resize bottom right corner",
    className: "-right-1.5 -bottom-1.5 size-3 cursor-nwse-resize",
    indicatorClassName: "right-0.5 bottom-0.5 size-2",
    type: "corner",
  },
  {
    edge: "s",
    label: "Resize bottom edge",
    className: "-bottom-1.5 left-1/2 h-3 w-10 -translate-x-1/2 cursor-s-resize",
    indicatorClassName: "right-2 bottom-1 left-2 h-0.5",
    type: "edge",
  },
  {
    edge: "sw",
    label: "Resize bottom left corner",
    className: "-bottom-1.5 -left-1.5 size-3 cursor-nesw-resize",
    indicatorClassName: "bottom-0.5 left-0.5 size-2",
    type: "corner",
  },
  {
    edge: "w",
    label: "Resize left edge",
    className: "top-1/2 -left-1.5 h-10 w-3 -translate-y-1/2 cursor-w-resize",
    indicatorClassName: "top-2 bottom-2 left-1/2 w-0.5 -translate-x-1/2",
    type: "edge",
  },
  {
    edge: "nw",
    label: "Resize top left corner",
    className: "-top-1.5 -left-1.5 size-3 cursor-nwse-resize",
    indicatorClassName: "top-0.5 left-0.5 size-2",
    type: "corner",
  },
]

export const EMPTY_LAYOUT: CanvasLayout = {
  canvas: { width: 1200, height: 800 },
  items: [],
}
