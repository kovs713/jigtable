export type CanvasSize = {
  width: number
  height: number
}

export type CanvasItem = {
  id: string
  src: string
  x: number
  y: number
  width: number
  height: number
  scale?: number
  zIndex?: number
}

export type CanvasLayout = {
  canvas: CanvasSize
  items: CanvasItem[]
}

export type CompositionLayoutResponse = {
  compositionId: string
  status: string | null
  layout: CanvasLayout
  jigsawImageUrl: string | null
}

export type CompositionRef = {
  compositionId: string
  token: string
  jigsawImageUrl: string | null
}

export type SelectedComposition = {
  compositionId: string
  compositionToken: string
}

export type AspectRatioPreset = {
  label: string
  width: number
  height: number
}

export type ResizeEdge = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw"

export type DragState =
  | {
      mode: "move"
      ids: string[]
      startClientX: number
      startClientY: number
      startItems: CanvasItem[]
    }
  | {
      mode: "item-resize"
      id: string
      edge: ResizeEdge
      startClientX: number
      startClientY: number
      startItem: CanvasItem
      startItems: CanvasItem[]
      keepRatio: boolean
    }
  | {
      mode: "canvas-resize"
      edge: ResizeEdge
      startClientX: number
      startClientY: number
      startCanvas: CanvasSize
      startItems: CanvasItem[]
      scaleItems: boolean
    }

export type ResizeHandle = {
  edge: ResizeEdge
  label: string
  className: string
  indicatorClassName: string
  type: "edge" | "corner"
}

export type LayerEntry = {
  item: CanvasItem
  itemIndex: number
  layerIndex: number
}

export type LayerAction = "top" | "up" | "down" | "bottom"

export type LayerDropPreview = {
  itemId: string
  placement: "above" | "below"
}

export type HoverLinkLine = {
  itemIndex: number
  path: string
}

export type ItemBounds = {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export type SelectionMode = "add" | "replace" | "toggle"

export type EditorStatus = {
  kind: "idle" | "loading" | "success" | "error"
  message: string
}
