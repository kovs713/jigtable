import type { Application, Container } from "pixi.js"

import type {
  JigsawConfig,
  WorldRect,
} from "@jigtable/jigsaw-core/jigsaw/types"

export interface WorldPoint {
  x: number
  y: number
}

export interface CameraController {
  readonly zoom: number
  readonly isTouchGestureActive: boolean
  screenToWorld: (clientX: number, clientY: number) => WorldPoint
  worldToScreen: (worldX: number, worldY: number) => WorldPoint
  fitToRect: (rect: WorldRect) => void
  zoomIn: () => void
  zoomOut: () => void
  resetView: () => void
  destroy: () => void
}

const ZOOM_STEP = 1.25

export function createCameraController(
  app: Application,
  world: Container,
  config: JigsawConfig,
  options: {
    canStartPrimaryPan?: (event: PointerEvent, world: WorldPoint) => boolean
  } = {}
): CameraController {
  const canvas = app.canvas as HTMLCanvasElement
  let zoom = 1
  let x = 0
  let y = 0
  let fittedRect: WorldRect | null = null
  let pan: {
    pointerId: number
    startClientX: number
    startClientY: number
    startX: number
    startY: number
  } | null = null
  const touches = new Map<number, WorldPoint>()
  let pinch: {
    startDistance: number
    startZoom: number
    focus: WorldPoint
  } | null = null

  function apply(): void {
    world.position.set(x, y)
    world.scale.set(zoom)
  }

  function clientToCanvas(clientX: number, clientY: number): WorldPoint {
    const rect = canvas.getBoundingClientRect()

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    }
  }

  function screenToWorld(clientX: number, clientY: number): WorldPoint {
    const point = clientToCanvas(clientX, clientY)

    return {
      x: (point.x - x) / zoom,
      y: (point.y - y) / zoom,
    }
  }

  function worldToScreen(worldX: number, worldY: number): WorldPoint {
    return {
      x: worldX * zoom + x,
      y: worldY * zoom + y,
    }
  }

  function zoomTo(clientX: number, clientY: number, nextZoom: number): void {
    const screen = clientToCanvas(clientX, clientY)
    const before = screenToWorld(clientX, clientY)

    zoom = clamp(nextZoom, config.minZoom, config.maxZoom)
    x = screen.x - before.x * zoom
    y = screen.y - before.y * zoom
    apply()
  }

  function zoomToward(clientX: number, clientY: number, amount: number): void {
    zoomTo(clientX, clientY, zoom * amount)
  }

  function zoomFromCenter(amount: number): void {
    const bounds = canvas.getBoundingClientRect()

    zoomToward(
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2,
      amount
    )
  }

  function fitToRect(rect: WorldRect): void {
    fittedRect = rect
    const bounds = canvas.getBoundingClientRect()
    const padding = 72
    const zoomX = (bounds.width - padding * 2) / rect.width
    const zoomY = (bounds.height - padding * 2) / rect.height
    zoom = clamp(Math.min(zoomX, zoomY), config.minZoom, config.maxZoom)
    x = bounds.width / 2 - (rect.x + rect.width / 2) * zoom
    y = bounds.height / 2 - (rect.y + rect.height / 2) * zoom
    apply()
  }

  function stopPanCapture(): void {
    if (!pan) {
      return
    }

    if (canvas.hasPointerCapture(pan.pointerId)) {
      canvas.releasePointerCapture(pan.pointerId)
    }

    pan = null
    canvas.style.cursor = ""
  }

  function getPinchDetails():
    | { centerClientX: number; centerClientY: number; distance: number }
    | null {
    const activeTouches = Array.from(touches.values()).slice(0, 2)

    if (activeTouches.length < 2) {
      return null
    }

    const [first, second] = activeTouches
    const distance = Math.hypot(first.x - second.x, first.y - second.y)

    if (distance <= 0) {
      return null
    }

    return {
      centerClientX: (first.x + second.x) / 2,
      centerClientY: (first.y + second.y) / 2,
      distance,
    }
  }

  function startPinch(): void {
    const details = getPinchDetails()

    if (!details) {
      return
    }

    stopPanCapture()
    pinch = {
      startDistance: details.distance,
      startZoom: zoom,
      focus: screenToWorld(details.centerClientX, details.centerClientY),
    }
  }

  function updatePinch(): void {
    const details = getPinchDetails()

    if (!pinch || !details) {
      return
    }

    const screen = clientToCanvas(details.centerClientX, details.centerClientY)

    zoom = clamp(
      pinch.startZoom * (details.distance / pinch.startDistance),
      config.minZoom,
      config.maxZoom
    )
    x = screen.x - pinch.focus.x * zoom
    y = screen.y - pinch.focus.y * zoom
    apply()
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault()
    const amount = Math.exp(-event.deltaY * 0.001)
    zoomToward(event.clientX, event.clientY, amount)
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.pointerType === "touch") {
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
      canvas.setPointerCapture(event.pointerId)

      if (touches.size >= 2) {
        event.preventDefault()
        startPinch()
        return
      }
    }

    if (pinch) {
      event.preventDefault()
      return
    }

    const world = screenToWorld(event.clientX, event.clientY)
    const isPrimaryEmptyPan =
      event.button === 0 && options.canStartPrimaryPan?.(event, world)

    if (!isPrimaryEmptyPan && event.button !== 1 && event.button !== 2) {
      return
    }

    event.preventDefault()
    pan = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: x,
      startY: y,
    }
    canvas.setPointerCapture(event.pointerId)
    canvas.style.cursor = "grabbing"
  }

  function onPointerMove(event: PointerEvent): void {
    if (event.pointerType === "touch" && touches.has(event.pointerId)) {
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY })

      if (pinch) {
        event.preventDefault()
        updatePinch()
        return
      }
    }

    if (!pan || event.pointerId !== pan.pointerId) {
      return
    }

    event.preventDefault()
    x = pan.startX + event.clientX - pan.startClientX
    y = pan.startY + event.clientY - pan.startClientY
    apply()
  }

  function stopPan(event: PointerEvent): void {
    if (!pan || event.pointerId !== pan.pointerId) {
      return
    }

    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId)
    }

    pan = null
    canvas.style.cursor = ""
  }

  function onPointerEnd(event: PointerEvent): void {
    if (event.pointerType === "touch") {
      touches.delete(event.pointerId)

      if (touches.size >= 2) {
        startPinch()
      } else {
        pinch = null
      }

      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId)
      }
    }

    stopPan(event)
  }

  canvas.addEventListener("wheel", onWheel, { passive: false })
  canvas.addEventListener("pointerdown", onPointerDown)
  canvas.addEventListener("pointermove", onPointerMove)
  canvas.addEventListener("pointerup", onPointerEnd)
  canvas.addEventListener("pointercancel", onPointerEnd)

  apply()

  return {
    get zoom() {
      return zoom
    },
    get isTouchGestureActive() {
      return pinch !== null || touches.size > 1
    },
    screenToWorld,
    worldToScreen,
    fitToRect,
    zoomIn() {
      zoomFromCenter(ZOOM_STEP)
    },
    zoomOut() {
      zoomFromCenter(1 / ZOOM_STEP)
    },
    resetView() {
      if (fittedRect) {
        fitToRect(fittedRect)
      }
    },
    destroy() {
      canvas.removeEventListener("wheel", onWheel)
      canvas.removeEventListener("pointerdown", onPointerDown)
      canvas.removeEventListener("pointermove", onPointerMove)
      canvas.removeEventListener("pointerup", onPointerEnd)
      canvas.removeEventListener("pointercancel", onPointerEnd)
    },
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
