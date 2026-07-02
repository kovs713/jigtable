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
  screenToWorld: (clientX: number, clientY: number) => WorldPoint
  fitToRect: (rect: WorldRect) => void
  destroy: () => void
}

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
  let pan: {
    pointerId: number
    startClientX: number
    startClientY: number
    startX: number
    startY: number
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

  function zoomToward(clientX: number, clientY: number, amount: number): void {
    const screen = clientToCanvas(clientX, clientY)
    const before = screenToWorld(clientX, clientY)
    zoom = clamp(zoom * amount, config.minZoom, config.maxZoom)
    x = screen.x - before.x * zoom
    y = screen.y - before.y * zoom
    apply()
  }

  function fitToRect(rect: WorldRect): void {
    const bounds = canvas.getBoundingClientRect()
    const padding = 72
    const zoomX = (bounds.width - padding * 2) / rect.width
    const zoomY = (bounds.height - padding * 2) / rect.height
    zoom = clamp(Math.min(zoomX, zoomY), config.minZoom, config.maxZoom)
    x = bounds.width / 2 - (rect.x + rect.width / 2) * zoom
    y = bounds.height / 2 - (rect.y + rect.height / 2) * zoom
    apply()
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault()
    const amount = Math.exp(-event.deltaY * 0.001)
    zoomToward(event.clientX, event.clientY, amount)
  }

  function onPointerDown(event: PointerEvent): void {
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

  canvas.addEventListener("wheel", onWheel, { passive: false })
  canvas.addEventListener("pointerdown", onPointerDown)
  canvas.addEventListener("pointermove", onPointerMove)
  canvas.addEventListener("pointerup", stopPan)
  canvas.addEventListener("pointercancel", stopPan)

  apply()

  return {
    get zoom() {
      return zoom
    },
    screenToWorld,
    fitToRect,
    destroy() {
      canvas.removeEventListener("wheel", onWheel)
      canvas.removeEventListener("pointerdown", onPointerDown)
      canvas.removeEventListener("pointermove", onPointerMove)
      canvas.removeEventListener("pointerup", stopPan)
      canvas.removeEventListener("pointercancel", stopPan)
    },
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
