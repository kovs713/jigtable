import { Container, Graphics } from "pixi.js"

import type {
  JigsawState,
  PieceId,
} from "@jigtable/jigsaw-core/jigsaw/types"
import type { JigsawLock } from "@jigtable/jigsaw-core/multiplayer/protocol"
import type { PieceViewSet } from "./pieces"

const OUTLINE_WIDTH = 2.5
const FILL_ALPHA = 0.12

export interface LockOverlayRenderer {
  update(locks: Map<string, JigsawLock>): void
  destroy(): void
}

export function createLockOverlayRenderer(
  lockLayer: Container,
  state: JigsawState,
  pieces: PieceViewSet
): LockOverlayRenderer {
  const container = new Container({ label: "jigsaw-lock-overlays" })
  const groupContainer = new Container({
    label: "jigsaw-lock-group-overlays",
  })
  const pieceContainer = new Container({
    label: "jigsaw-lock-piece-overlays",
  })

  container.addChild(groupContainer, pieceContainer)
  lockLayer.addChild(container)

  const groupGraphics = new Map<string, Graphics>()
  const pieceGraphics = new Map<string, Graphics>()

  function update(locks: Map<string, JigsawLock>): void {
    const lockedGroupIds = new Set<string>()

    for (const [, lock] of locks) {
      if (lock.targetType === "group") {
        lockedGroupIds.add(lock.targetId)
      }
    }

    const allPlaced = (pieceIds: string[]) =>
      pieceIds.every((id) => state.pieces[id]?.placed)

    for (const [groupId, gfx] of groupGraphics) {
      const shouldRender =
        lockedGroupIds.has(groupId) &&
        !allPlaced(state.groups[groupId]?.pieceIds ?? [])

      if (!shouldRender) {
        groupContainer.removeChild(gfx)
        gfx.destroy()
        groupGraphics.delete(groupId)
      } else {
        const lock = locks.get(`group:${groupId}`)!
        gfx.clear()
        drawGroupOutline(
          gfx,
          state,
          state.groups[groupId]?.pieceIds ?? [],
          hexToGraphicsColor(lock.playerColor),
          FILL_ALPHA
        )
      }
    }

    for (const [pieceId, gfx] of pieceGraphics) {
      const piece = state.pieces[pieceId]
      const inLockedGroup =
        lockedGroupIds.has(piece?.groupId ?? "")
      const stillLocked =
        !inLockedGroup &&
        !piece?.placed &&
        locks.has(`piece:${pieceId}`)

      if (!stillLocked) {
        pieceContainer.removeChild(gfx)
        gfx.destroy()
        pieceGraphics.delete(pieceId)
      } else {
        const margin = getPieceMargin(state)
        gfx.position.set(piece.x - margin, piece.y - margin)
      }
    }

    for (const [, lock] of locks) {
      if (lock.targetType === "group") {
        const gid = lock.targetId
        const pieceIds = state.groups[gid]?.pieceIds ?? []

        if (groupGraphics.has(gid) || allPlaced(pieceIds)) {
          continue
        }

        const gfx = new Graphics({ label: `lock-group-${gid}` })
        drawGroupOutline(
          gfx,
          state,
          pieceIds,
          hexToGraphicsColor(lock.playerColor),
          FILL_ALPHA
        )
        groupGraphics.set(gid, gfx)
        groupContainer.addChild(gfx)
      }
    }

    for (const [, lock] of locks) {
      if (lock.targetType === "piece") {
        const pid = lock.targetId
        const piece = state.pieces[pid]

        if (!piece || piece.placed || lockedGroupIds.has(piece.groupId)) {
          continue
        }

        if (pieceGraphics.has(pid)) {
          continue
        }

        const def = state.definitions[pid]
        const view = pieces.byId.get(pid)

        if (!def || !view) {
          continue
        }

        const margin = getPieceMargin(state)
        const w = Math.ceil(def.width + margin * 2)
        const h = Math.ceil(def.height + margin * 2)
        const color = hexToGraphicsColor(lock.playerColor)
        const gfx = new Graphics({ label: `lock-piece-${pid}` })
        drawPieceOutline(gfx, def, margin, w, h, color, FILL_ALPHA)
        gfx.position.set(piece.x - margin, piece.y - margin)
        pieceGraphics.set(pid, gfx)
        pieceContainer.addChild(gfx)
      }
    }
  }

  function destroy(): void {
    for (const [, gfx] of groupGraphics) {
      groupContainer.removeChild(gfx)
      gfx.destroy()
    }
    groupGraphics.clear()

    for (const [, gfx] of pieceGraphics) {
      pieceContainer.removeChild(gfx)
      gfx.destroy()
    }
    pieceGraphics.clear()

    lockLayer.removeChild(container)
    container.destroy()
  }

  return { update, destroy }
}

function drawPieceOutline(
  gfx: Graphics,
  def: import("@jigtable/jigsaw-core/jigsaw/types").PieceDefinition,
  margin: number,
  w: number,
  h: number,
  color: number,
  fillAlpha: number
): void {
  const x = margin
  const y = margin

  gfx.fill({ color, alpha: fillAlpha })
  gfx.stroke({ width: OUTLINE_WIDTH, color, alpha: 0.9 })

  drawPieceShapePath(gfx, def, x, y)
  gfx.fill()
  gfx.stroke()
}

function drawPieceShapePath(
  gfx: Graphics,
  def: import("@jigtable/jigsaw-core/jigsaw/types").PieceDefinition,
  offsetX: number,
  offsetY: number
): void {
  const x = offsetX
  const y = offsetY
  const w = def.width
  const h = def.height

  gfx.moveTo(x, y)
  addEdgeGraphics(gfx, x, y, x + w, y, 0, -1, def.edges.top, h)
  addEdgeGraphics(gfx, x + w, y, x + w, y + h, 1, 0, def.edges.right, w)
  addEdgeGraphics(gfx, x + w, y + h, x, y + h, 0, 1, def.edges.bottom, h)
  addEdgeGraphics(gfx, x, y + h, x, y, -1, 0, def.edges.left, w)
  gfx.closePath()
}

function addEdgeGraphics(
  gfx: Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  normalX: number,
  normalY: number,
  shape: import("@jigtable/jigsaw-core/jigsaw/types").PieceEdgeShape,
  perpendicularLength: number
): void {
  if (shape.points.length === 0) {
    gfx.lineTo(x2, y2)
    return
  }

  const deltaX = x2 - x1
  const deltaY = y2 - y1
  const length = Math.hypot(deltaX, deltaY)
  const unitX = deltaX / length
  const unitY = deltaY / length

  for (let index = 1; index < shape.points.length; index += 3) {
    const c1 = edgePointToWorld(
      shape.points[index],
      x1, y1, unitX, unitY, normalX, normalY, length, perpendicularLength
    )
    const c2 = edgePointToWorld(
      shape.points[index + 1],
      x1, y1, unitX, unitY, normalX, normalY, length, perpendicularLength
    )
    const end = edgePointToWorld(
      shape.points[index + 2],
      x1, y1, unitX, unitY, normalX, normalY, length, perpendicularLength
    )
    gfx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, end.x, end.y)
  }
}

function drawGroupOutline(
  gfx: Graphics,
  state: JigsawState,
  pieceIds: PieceId[],
  color: number,
  fillAlpha: number
): void {
  const margin = getPieceMargin(state)

  const pieces = pieceIds
    .map((id) => {
      const piece = state.pieces[id]
      const def = state.definitions[id]
      return piece && def ? { piece, def } : null
    })
    .filter(Boolean) as Array<{
    piece: import("@jigtable/jigsaw-core/jigsaw/types").PieceState
    def: import("@jigtable/jigsaw-core/jigsaw/types").PieceDefinition
  }>

  if (pieces.length === 0) {
    return
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const { piece, def } of pieces) {
    minX = Math.min(minX, piece.x)
    minY = Math.min(minY, piece.y)
    maxX = Math.max(maxX, piece.x + def.width)
    maxY = Math.max(maxY, piece.y + def.height)
  }

  const pad = OUTLINE_WIDTH + 1
  const canvasW = Math.ceil(maxX - minX + pad * 2)
  const canvasH = Math.ceil(maxY - minY + pad * 2)

  if (canvasW <= 0 || canvasH <= 0) {
    return
  }

  const canvas = document.createElement("canvas")
  canvas.width = canvasW
  canvas.height = canvasH
  const ctx = canvas.getContext("2d")!

  for (const { piece, def } of pieces) {
    const path = createPiecePathLocal(def, margin)
    ctx.save()
    ctx.translate(piece.x - minX + pad, piece.y - minY + pad)
    ctx.fillStyle = "white"
    ctx.fill(path)
    ctx.restore()
  }

  const contour = traceOuterBoundary(ctx, canvasW, canvasH)

  if (contour.length < 3) {
    return
  }

  gfx.fill({ color, alpha: fillAlpha })
  gfx.stroke({ width: OUTLINE_WIDTH, color, alpha: 0.9 })

  gfx.moveTo(contour[0].x + minX - pad, contour[0].y + minY - pad)

  for (let i = 1; i < contour.length; i++) {
    gfx.lineTo(contour[i].x + minX - pad, contour[i].y + minY - pad)
  }

  gfx.closePath()
  gfx.fill()
  gfx.stroke()
}

function createPiecePathLocal(
  def: import("@jigtable/jigsaw-core/jigsaw/types").PieceDefinition,
  margin: number
): Path2D {
  const path = new Path2D()
  const x = margin
  const y = margin
  const width = def.width
  const height = def.height

  path.moveTo(x, y)
  addEdgeLocal(path, x, y, x + width, y, 0, -1, def.edges.top, height)
  addEdgeLocal(path, x + width, y, x + width, y + height, 1, 0, def.edges.right, width)
  addEdgeLocal(path, x + width, y + height, x, y + height, 0, 1, def.edges.bottom, height)
  addEdgeLocal(path, x, y + height, x, y, -1, 0, def.edges.left, width)
  path.closePath()

  return path
}

function addEdgeLocal(
  path: Path2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  normalX: number,
  normalY: number,
  shape: import("@jigtable/jigsaw-core/jigsaw/types").PieceEdgeShape,
  perpendicularLength: number
): void {
  if (shape.points.length === 0) {
    path.lineTo(x2, y2)
    return
  }

  const deltaX = x2 - x1
  const deltaY = y2 - y1
  const length = Math.hypot(deltaX, deltaY)
  const unitX = deltaX / length
  const unitY = deltaY / length

  for (let index = 1; index < shape.points.length; index += 3) {
    const c1 = edgePointToWorld(
      shape.points[index], x1, y1, unitX, unitY, normalX, normalY, length, perpendicularLength
    )
    const c2 = edgePointToWorld(
      shape.points[index + 1], x1, y1, unitX, unitY, normalX, normalY, length, perpendicularLength
    )
    const end = edgePointToWorld(
      shape.points[index + 2], x1, y1, unitX, unitY, normalX, normalY, length, perpendicularLength
    )
    path.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, end.x, end.y)
  }
}

function traceOuterBoundary(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): Array<{ x: number; y: number }> {
  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data

  let startX = -1
  let startY = -1

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 128) {
        startX = x
        startY = y
        break
      }
    }
    if (startX >= 0) break
  }

  if (startX < 0) {
    return []
  }

  const moore: Array<[number, number]> = [
    [-1, -1], [0, -1], [1, -1],
    [1, 0], [1, 1], [0, 1],
    [-1, 1], [-1, 0],
  ]

  const contour: Array<{ x: number; y: number }> = []
  let cx = startX
  let cy = startY
  let px = startX - 1
  let py = startY

  let safety = w * h * 2

  while (safety-- > 0) {
    contour.push({ x: cx, y: cy })

    let startIdx = 0
    for (let i = 0; i < 8; i++) {
      if (cx + moore[i][0] === px && cy + moore[i][1] === py) {
        startIdx = (i + 1) % 8
        break
      }
    }

    let found = false
    for (let i = 0; i < 8; i++) {
      const n = (startIdx + i) % 8
      const nx = cx + moore[n][0]
      const ny = cy + moore[n][1]

      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        if (data[(ny * w + nx) * 4 + 3] > 128) {
          px = cx
          py = cy
          cx = nx
          cy = ny
          found = true
          break
        }
      }
    }

    if (!found) break
    if (cx === startX && cy === startY) break
  }

  return simplifyContour(contour, 1)
}

function simplifyContour(
  points: Array<{ x: number; y: number }>,
  epsilon: number
): Array<{ x: number; y: number }> {
  if (points.length <= 2) {
    return points
  }

  let maxDist = 0
  let maxIdx = 0
  const first = points[0]
  const last = points[points.length - 1]

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last)
    if (dist > maxDist) {
      maxDist = dist
      maxIdx = i
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyContour(points.slice(0, maxIdx + 1), epsilon)
    const right = simplifyContour(points.slice(maxIdx), epsilon)
    return [...left.slice(0, -1), ...right]
  }

  return [first, last]
}

function perpendicularDistance(
  point: { x: number; y: number },
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number }
): number {
  const dx = lineEnd.x - lineStart.x
  const dy = lineEnd.y - lineStart.y
  const lengthSq = dx * dx + dy * dy

  if (lengthSq === 0) {
    return Math.hypot(point.x - lineStart.x, point.y - lineStart.y)
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSq
    )
  )
  const projX = lineStart.x + t * dx
  const projY = lineStart.y + t * dy

  return Math.hypot(point.x - projX, point.y - projY)
}

function edgePointToWorld(
  point: import("@jigtable/jigsaw-core/jigsaw/types").PieceEdgePoint,
  x: number, y: number,
  unitX: number, unitY: number,
  normalX: number, normalY: number,
  length: number, perpendicularLength: number
): { x: number; y: number } {
  return {
    x: x + unitX * point.l * length + normalX * point.w * perpendicularLength,
    y: y + unitY * point.l * length + normalY * point.w * perpendicularLength,
  }
}

function getPieceMargin(state: JigsawState): number {
  const t = state.config.tabSizePercent / 200
  const j = state.config.jitterPercent / 100
  const maxTabDepth =
    (3 * t + j) * Math.max(state.config.pieceWidth, state.config.pieceHeight)

  return Math.ceil(maxTabDepth + 2)
}

function hexToGraphicsColor(hex: string): number {
  const parsed = Number.parseInt(hex.replace("#", ""), 16)
  return Number.isNaN(parsed) ? 0xffffff : parsed
}
