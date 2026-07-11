import type { Application } from "pixi.js"
import { Container, Graphics, Text } from "pixi.js"

import type { JigsawPlayerCursor } from "@jigtable/core/protocol"

import type { JigsawMultiplayerClient } from "../multiplayer/client"
import type { CameraController } from "./camera"

// multiplayer cursor broadcast throttle — 40 events/sec
const CURSOR_SEND_INTERVAL_MS = 25

export interface RemoteCursorViewSet {
  applyCursor: (cursor: JigsawPlayerCursor) => void
  syncCursors: (cursors: JigsawPlayerCursor[], localPlayerId: string) => void
  removeCursor: (playerId: string) => void
  destroy: () => void
}

export interface CursorBroadcastController {
  destroy: () => void
}

interface RemoteCursorView {
  container: Container
  pointer: Graphics
  label: Text
  labelBackground: Graphics
  playerName: string
  color: number
}

export function createRemoteCursorViews(
  app: Application,
  layer: Container,
  camera: CameraController
): RemoteCursorViewSet {
  const cursorLayer = new Container({ label: "jigsaw-cursor-layer" })
  const views = new Map<string, RemoteCursorView>()

  cursorLayer.eventMode = "none"
  layer.addChild(cursorLayer)

  function updateScales(): void {
    const scale = 1 / camera.zoom

    for (const view of views.values()) {
      view.container.scale.set(scale)
    }
  }

  app.ticker.add(updateScales)

  function applyCursor(cursor: JigsawPlayerCursor): void {
    const view = getOrCreateCursorView(cursor, app)

    updateCursorView(view, cursor)
    view.container.position.set(cursor.x, cursor.y)
    view.container.scale.set(1 / camera.zoom)
    view.container.visible = true
  }

  function syncCursors(
    cursors: JigsawPlayerCursor[],
    localPlayerId: string
  ): void {
    const seen = new Set<string>()

    for (const cursor of cursors) {
      if (cursor.playerId === localPlayerId) {
        continue
      }

      seen.add(cursor.playerId)
      applyCursor(cursor)
    }

    for (const playerId of views.keys()) {
      if (!seen.has(playerId)) {
        removeCursor(playerId)
      }
    }
  }

  function removeCursor(playerId: string): void {
    const view = views.get(playerId)

    if (!view) {
      return
    }

    views.delete(playerId)
    view.container.destroy({ children: true })
  }

  function getOrCreateCursorView(
    cursor: JigsawPlayerCursor,
    app: Application
  ): RemoteCursorView {
    const existing = views.get(cursor.playerId)

    if (existing) {
      return existing
    }

    const view = createCursorView(cursor, app)
    views.set(cursor.playerId, view)
    cursorLayer.addChild(view.container)

    return view
  }

  return {
    applyCursor,
    syncCursors,
    removeCursor,
    destroy() {
      app.ticker.remove(updateScales)
      cursorLayer.destroy({ children: true })
      views.clear()
    },
  }
}

export function setupCursorBroadcast({
  app,
  camera,
  getConnection,
}: {
  app: Application
  camera: CameraController
  getConnection: () => JigsawMultiplayerClient | null
}): CursorBroadcastController {
  const canvas = app.canvas as HTMLCanvasElement
  let lastSentAt = 0

  function onPointerMove(event: PointerEvent): void {
    const connection = getConnection()

    if (!connection?.isConnected()) {
      return
    }

    const now = performance.now()

    if (now - lastSentAt < CURSOR_SEND_INTERVAL_MS) {
      return
    }

    const world = camera.screenToWorld(event.clientX, event.clientY)
    lastSentAt = now
    connection.send({ type: "cursor:move", x: world.x, y: world.y })
  }

  function onPointerLeave(): void {
    getConnection()?.send({ type: "cursor:hide" })
  }

  canvas.addEventListener("pointermove", onPointerMove)
  canvas.addEventListener("pointerleave", onPointerLeave)

  return {
    destroy() {
      canvas.removeEventListener("pointermove", onPointerMove)
      canvas.removeEventListener("pointerleave", onPointerLeave)
    },
  }
}

function createCursorView(
  cursor: JigsawPlayerCursor,
  app: Application
): RemoteCursorView {
  const color =
    colorToNumber(cursor.color) ?? colorFromPlayerId(cursor.playerId)
  const container = new Container({ label: `cursor-${cursor.playerId}` })
  const pointer = new Graphics()
  const label = new Text({
    text: cursor.playerName,
    resolution: app.renderer.resolution,
    style: {
      fill: color,
      fontFamily: "Satoshi, system-ui, sans-serif",
      fontSize: 14,
      fontWeight: "700",
    },
  })
  const labelBackground = new Graphics()

  label.position.set(26, 16)

  container.eventMode = "none"
  container.addChild(pointer, labelBackground, label)

  const view = {
    container,
    pointer,
    label,
    labelBackground,
    playerName: cursor.playerName,
    color,
  } satisfies RemoteCursorView

  drawCursorView(view)

  return view
}

function updateCursorView(
  view: RemoteCursorView,
  cursor: JigsawPlayerCursor
): void {
  const color =
    colorToNumber(cursor.color) ?? colorFromPlayerId(cursor.playerId)

  if (view.playerName === cursor.playerName && view.color === color) {
    return
  }

  view.playerName = cursor.playerName
  view.color = color
  view.label.text = cursor.playerName
  view.label.style.fill = color
  drawCursorView(view)
}

function drawCursorView(view: RemoteCursorView): void {
  view.pointer
    .clear()
    .moveTo(0, 0)
    .lineTo(0, 20)
    .lineTo(5, 15)
    .lineTo(9, 25)
    .lineTo(13, 23)
    .lineTo(9, 13)
    .lineTo(17, 13)
    .closePath()
    .fill({ color: view.color, alpha: 0.96 })
    .stroke({ width: 1.5, color: 0x0a1018, alpha: 0.9 })

  view.labelBackground
    .clear()
    .rect(20, 12, view.label.width + 14, 22)
    .fill({ color: 0x0a1018, alpha: 0.82 })
    .stroke({ width: 1, color: view.color, alpha: 0.92 })
}

function colorToNumber(color: string): number | null {
  const normalized = color.trim().replace(/^#/, "")

  return /^[0-9a-f]{6}$/i.test(normalized)
    ? Number.parseInt(normalized, 16)
    : null
}

function colorFromPlayerId(playerId: string): number {
  let hash = 0

  for (let index = 0; index < playerId.length; index++) {
    hash = (hash * 31 + playerId.charCodeAt(index)) >>> 0
  }

  const hue = hash % 360

  return hslToRgb(hue / 360, 0.72, 0.58)
}

function hslToRgb(hue: number, saturation: number, lightness: number): number {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const x = chroma * (1 - Math.abs(((hue * 6) % 2) - 1))
  const match = lightness - chroma / 2
  const sector = Math.floor(hue * 6)
  const [red, green, blue] =
    sector === 0
      ? [chroma, x, 0]
      : sector === 1
        ? [x, chroma, 0]
        : sector === 2
          ? [0, chroma, x]
          : sector === 3
            ? [0, x, chroma]
            : sector === 4
              ? [x, 0, chroma]
              : [chroma, 0, x]

  return (
    (Math.round((red + match) * 255) << 16) |
    (Math.round((green + match) * 255) << 8) |
    Math.round((blue + match) * 255)
  )
}
