import {
  ASPECT_RATIO_PRESETS,
  MAX_CANVAS_SIZE,
  MIN_CANVAS_SIZE,
  MIN_ITEM_SIZE,
} from "./constants"
import { normalizeItemLayers } from "./layers"
import type {
  CanvasItem,
  CanvasLayout,
  CanvasSize,
  DragState,
  ItemBounds,
  ResizeEdge,
} from "./types"

export function resizeCanvasLayout(
  drag: Extract<DragState, { mode: "canvas-resize" }>,
  dx: number,
  dy: number
): CanvasLayout {
  const widthDelta = edgeHas(drag.edge, "e")
    ? dx
    : edgeHas(drag.edge, "w")
      ? -dx
      : 0
  const heightDelta = edgeHas(drag.edge, "s")
    ? dy
    : edgeHas(drag.edge, "n")
      ? -dy
      : 0
  const canvas = clampCanvas({
    width: drag.startCanvas.width + widthDelta,
    height: drag.startCanvas.height + heightDelta,
  })
  const nextCanvas = drag.scaleItems
    ? canvas
    : clampCanvasToItems(canvas, drag.startItems)

  return {
    canvas: nextCanvas,
    items: drag.scaleItems
      ? scaleItemsToCanvas(drag.startCanvas, drag.startItems, nextCanvas)
      : drag.startItems.map((item) => ({ ...item })),
  }
}

export function clampCanvasToItems(
  canvas: CanvasSize,
  items: CanvasItem[]
): CanvasSize {
  if (!items.length) return { ...canvas }
  const bounds = getItemsBounds(items)
  return clampCanvas({
    width: Math.max(canvas.width, bounds.right),
    height: Math.max(canvas.height, bounds.bottom),
  })
}

export function normalizeCanvasLayout(layout: CanvasLayout): CanvasLayout {
  const canvas = fitCanvasWithinLimits(layout.canvas)
  const items = normalizeItemLayers(layout.items)

  return canvas.width === layout.canvas.width &&
    canvas.height === layout.canvas.height
    ? { ...layout, canvas: { ...canvas }, items }
    : { canvas, items: scaleItemsToCanvas(layout.canvas, items, canvas) }
}

export function fitCanvasWithinLimits(canvas: CanvasSize): CanvasSize {
  const width = Math.max(1, Math.round(canvas.width))
  const height = Math.max(1, Math.round(canvas.height))
  const scale = Math.min(1, MAX_CANVAS_SIZE / width, MAX_CANVAS_SIZE / height)
  return clampCanvas({ width: width * scale, height: height * scale })
}

export function clampCanvas(canvas: CanvasSize): CanvasSize {
  return {
    width: clampCanvasSize(canvas.width),
    height: clampCanvasSize(canvas.height),
  }
}

export function clampCanvasSize(value: number): number {
  return clamp(
    Math.round(value || MIN_CANVAS_SIZE),
    MIN_CANVAS_SIZE,
    MAX_CANVAS_SIZE
  )
}

export function getCanvasForMaxSide(
  canvas: CanvasSize,
  maxSide: number
): CanvasSize {
  const ratio = canvas.width / canvas.height
  const size = clampCanvasSize(maxSide)
  return canvas.width >= canvas.height
    ? clampCanvas({ width: size, height: size / ratio })
    : clampCanvas({ width: size * ratio, height: size })
}

export function scaleItemsToCanvas(
  fromCanvas: CanvasSize,
  items: CanvasItem[],
  toCanvas: CanvasSize
): CanvasItem[] {
  const scaleX = toCanvas.width / fromCanvas.width
  const scaleY = toCanvas.height / fromCanvas.height

  return items.map((item) => {
    const x = clamp(Math.round(item.x * scaleX), 0, toCanvas.width - 1)
    const y = clamp(Math.round(item.y * scaleY), 0, toCanvas.height - 1)
    const width = clamp(
      Math.max(1, Math.round(item.width * scaleX)),
      1,
      toCanvas.width - x
    )
    const height = clamp(
      Math.max(1, Math.round(item.height * scaleY)),
      1,
      toCanvas.height - y
    )
    return updateScale({ ...item, x, y, width, height }, item)
  })
}

export function getCanvasForRatio(
  canvas: CanvasSize,
  ratio: number
): CanvasSize {
  const area = canvas.width * canvas.height
  const width = Math.max(MIN_CANVAS_SIZE, Math.round(Math.sqrt(area * ratio)))
  const height = Math.max(MIN_CANVAS_SIZE, Math.round(width / ratio))
  return clampCanvas({ width, height })
}

export function getCanvasRatioLabel(
  canvas: CanvasSize,
  originalCanvas: CanvasSize
): string {
  if (sameCanvasRatio(canvas, originalCanvas)) return "original"
  return (
    ASPECT_RATIO_PRESETS.find((item) =>
      sameRatio(canvas.width / canvas.height, item.width / item.height)
    )?.label ?? "Custom"
  )
}

export function sameCanvasRatio(
  canvas: CanvasSize,
  target: CanvasSize
): boolean {
  return sameRatio(canvas.width / canvas.height, target.width / target.height)
}

export function sameRatio(current: number, target: number): boolean {
  return Math.abs(current - target) < 0.002
}

export function clampItem(item: CanvasItem, canvas: CanvasSize): CanvasItem {
  const width = clamp(
    Math.round(item.width || MIN_ITEM_SIZE),
    MIN_ITEM_SIZE,
    canvas.width
  )
  const height = clamp(
    Math.round(item.height || MIN_ITEM_SIZE),
    MIN_ITEM_SIZE,
    canvas.height
  )
  return {
    ...item,
    x: clamp(Math.round(item.x || 0), 0, canvas.width - width),
    y: clamp(Math.round(item.y || 0), 0, canvas.height - height),
    width,
    height,
  }
}

export function moveItemsWithinCanvas(
  items: CanvasItem[],
  canvas: CanvasSize,
  dx: number,
  dy: number
): CanvasItem[] {
  if (!items.length) return []
  const bounds = getItemsBounds(items)
  const moveX = clamp(Math.round(dx), -bounds.left, canvas.width - bounds.right)
  const moveY = clamp(
    Math.round(dy),
    -bounds.top,
    canvas.height - bounds.bottom
  )
  return items.map((item) => ({
    ...item,
    x: item.x + moveX,
    y: item.y + moveY,
  }))
}

export function resizeItemsFromEdge(
  items: CanvasItem[],
  canvas: CanvasSize,
  dx: number,
  dy: number,
  edge: ResizeEdge,
  keepRatio: boolean
): CanvasItem[] {
  if (!items.length) return []
  const bounds = getItemsBounds(items)
  const nextBounds = resizeBoundsFromEdge(
    bounds,
    canvas,
    dx,
    dy,
    edge,
    keepRatio,
    getMinGroupSize(items, bounds)
  )
  const scaleX = nextBounds.width / bounds.width
  const scaleY = nextBounds.height / bounds.height

  return items.map((item) =>
    clampItem(
      updateScale(
        {
          ...item,
          x: Math.round(nextBounds.left + (item.x - bounds.left) * scaleX),
          y: Math.round(nextBounds.top + (item.y - bounds.top) * scaleY),
          width: Math.round(item.width * scaleX),
          height: Math.round(item.height * scaleY),
        },
        item
      ),
      canvas
    )
  )
}

export function resizeBoundsFromEdge(
  bounds: ItemBounds,
  canvas: CanvasSize,
  dx: number,
  dy: number,
  edge: ResizeEdge,
  keepRatio: boolean,
  minSize: CanvasSize
): ItemBounds {
  let left = bounds.left
  let top = bounds.top
  let right = bounds.right
  let bottom = bounds.bottom

  if (edgeHas(edge, "w"))
    left = clamp(bounds.left + dx, 0, bounds.right - minSize.width)
  if (edgeHas(edge, "e"))
    right = clamp(bounds.right + dx, bounds.left + minSize.width, canvas.width)
  if (edgeHas(edge, "n"))
    top = clamp(bounds.top + dy, 0, bounds.bottom - minSize.height)
  if (edgeHas(edge, "s"))
    bottom = clamp(
      bounds.bottom + dy,
      bounds.top + minSize.height,
      canvas.height
    )

  if (keepRatio && edge.length === 2) {
    const ratio = bounds.width / bounds.height
    let width = right - left
    let height = bottom - top
    if (Math.abs(dx) >= Math.abs(dy)) height = width / ratio
    else width = height * ratio

    if (edgeHas(edge, "w")) left = right - width
    else right = left + width
    if (edgeHas(edge, "n")) top = bottom - height
    else bottom = top + height

    if (left < 0) {
      right -= left
      left = 0
    }
    if (top < 0) {
      bottom -= top
      top = 0
    }
    if (right > canvas.width) {
      left -= right - canvas.width
      right = canvas.width
    }
    if (bottom > canvas.height) {
      top -= bottom - canvas.height
      bottom = canvas.height
    }
  }

  left = clamp(left, 0, canvas.width - minSize.width)
  top = clamp(top, 0, canvas.height - minSize.height)
  right = clamp(right, left + minSize.width, canvas.width)
  bottom = clamp(bottom, top + minSize.height, canvas.height)
  return { left, top, right, bottom, width: right - left, height: bottom - top }
}

export function getMinGroupSize(
  items: CanvasItem[],
  bounds: ItemBounds
): CanvasSize {
  const minScaleX = Math.max(...items.map((item) => MIN_ITEM_SIZE / item.width))
  const minScaleY = Math.max(
    ...items.map((item) => MIN_ITEM_SIZE / item.height)
  )
  return {
    width: Math.min(bounds.width, bounds.width * minScaleX),
    height: Math.min(bounds.height, bounds.height * minScaleY),
  }
}

export function getItemsBounds(items: CanvasItem[]): ItemBounds {
  const bounds = items.reduce(
    (current, item) => ({
      left: Math.min(current.left, item.x),
      top: Math.min(current.top, item.y),
      right: Math.max(current.right, item.x + item.width),
      bottom: Math.max(current.bottom, item.y + item.height),
    }),
    { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
  )
  return {
    ...bounds,
    width: bounds.right - bounds.left,
    height: bounds.bottom - bounds.top,
  }
}

export function resizeItemFromEdge(
  item: CanvasItem,
  canvas: CanvasSize,
  dx: number,
  dy: number,
  edge: ResizeEdge,
  keepRatio: boolean
): CanvasItem {
  const startRight = item.x + item.width
  const startBottom = item.y + item.height
  let left = item.x
  let top = item.y
  let right = startRight
  let bottom = startBottom

  if (edgeHas(edge, "w"))
    left = clamp(item.x + dx, 0, startRight - MIN_ITEM_SIZE)
  if (edgeHas(edge, "e"))
    right = clamp(startRight + dx, item.x + MIN_ITEM_SIZE, canvas.width)
  if (edgeHas(edge, "n"))
    top = clamp(item.y + dy, 0, startBottom - MIN_ITEM_SIZE)
  if (edgeHas(edge, "s"))
    bottom = clamp(startBottom + dy, item.y + MIN_ITEM_SIZE, canvas.height)

  if (keepRatio && edge.length === 2) {
    const ratio = item.width / item.height
    let width = right - left
    let height = bottom - top
    if (Math.abs(dx) >= Math.abs(dy)) height = width / ratio
    else width = height * ratio
    if (edgeHas(edge, "w")) left = right - width
    else right = left + width
    if (edgeHas(edge, "n")) top = bottom - height
    else bottom = top + height
    left = clamp(left, 0, canvas.width - MIN_ITEM_SIZE)
    top = clamp(top, 0, canvas.height - MIN_ITEM_SIZE)
    right = clamp(right, left + MIN_ITEM_SIZE, canvas.width)
    bottom = clamp(bottom, top + MIN_ITEM_SIZE, canvas.height)
  }

  return updateScale(
    {
      ...item,
      x: Math.round(left),
      y: Math.round(top),
      width: Math.round(right - left),
      height: Math.round(bottom - top),
    },
    item
  )
}

export function edgeHas(
  edge: ResizeEdge,
  direction: "n" | "e" | "s" | "w"
): boolean {
  return edge.includes(direction)
}

export function updateScale(
  next: CanvasItem,
  previous: CanvasItem
): CanvasItem {
  const originalWidth =
    previous.scale && previous.scale > 0
      ? previous.width / previous.scale
      : previous.width
  return { ...next, scale: round(next.width / originalWidth) }
}

export function getArrowOffset(
  key: string,
  step: number
): { x: number; y: number } | null {
  if (key === "ArrowLeft") return { x: -step, y: 0 }
  if (key === "ArrowRight") return { x: step, y: 0 }
  if (key === "ArrowUp") return { x: 0, y: -step }
  if (key === "ArrowDown") return { x: 0, y: step }
  return null
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function round(value: number): number {
  return Math.round(value * 1_000_000) * 1_000_000
}
