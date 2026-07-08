import { Container, Graphics } from "pixi.js"

import type {
  JigsawState,
  PieceEdgePoint,
  PieceEdgeShape,
  PieceId,
  PieceDefinition,
} from "@jigtable/jigsaw-core/jigsaw/types"
import type { JigsawLock } from "@jigtable/jigsaw-core/multiplayer/protocol"
import type { PieceViewSet } from "./pieces"

type EdgeSide = "top" | "right" | "bottom" | "left"

const OUTLINE_WIDTH = 2.5
const FILL_ALPHA = 0.12

// Допуск для snapped pieces. Если видишь внутренние линии из-за float drift — подними до 3-4.
const GROUP_EDGE_EPS = 2

export interface LockOverlayRenderer {
  update(locks: Map<string, JigsawLock>): void
  destroy(): void
}

interface GroupBounds {
  x: number
  y: number
  width: number
  height: number
  margin: number
}

interface GroupOverlay {
  gfx: Graphics
  geometryKey: string
  color: number
}

interface VectorOutlineEdge {
  id: string
  pieceId: PieceId
  side: EdgeSide
  x1: number
  y1: number
  x2: number
  y2: number
  normalX: number
  normalY: number
  shape: PieceEdgeShape
  perpendicularLength: number
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

  const groupOverlays = new Map<string, GroupOverlay>()
  const pieceGraphics = new Map<string, Graphics>()

  function update(locks: Map<string, JigsawLock>): void {
    const groupLocks = new Map<string, JigsawLock>()
    const lockedGroupIds = new Set<string>()

    for (const [, lock] of locks) {
      if (lock.targetType === "group") {
        groupLocks.set(lock.targetId, lock)
        lockedGroupIds.add(lock.targetId)
      }
    }

    const allPlaced = (pieceIds: PieceId[]) =>
      pieceIds.length > 0 && pieceIds.every((id) => state.pieces[id]?.placed)

    // Existing group overlays:
    // - destroy if lock disappeared
    // - rebuild geometry only if group composition/relative geometry changed
    // - otherwise only move gfx.position
    for (const [groupId, overlay] of groupOverlays) {
      const lock = groupLocks.get(groupId)
      const pieceIds = getCurrentGroupPieceIds(state, groupId)

      const shouldRender = !!lock && pieceIds.length > 0 && !allPlaced(pieceIds)

      if (!shouldRender) {
        groupContainer.removeChild(overlay.gfx)
        overlay.gfx.destroy()
        groupOverlays.delete(groupId)
        continue
      }

      updateGroupOverlay(
        overlay,
        state,
        pieceIds,
        hexToGraphicsColor(lock.playerColor),
        FILL_ALPHA
      )
    }

    // Existing piece overlays.
    // Для piece shape рисуется один раз, дальше только position update.
    for (const [pieceId, gfx] of pieceGraphics) {
      const piece = state.pieces[pieceId]
      const inLockedGroup = lockedGroupIds.has(piece?.groupId ?? "")

      const stillLocked =
        !!piece &&
        !inLockedGroup &&
        !piece.placed &&
        locks.has(`piece:${pieceId}`)

      if (!stillLocked) {
        pieceContainer.removeChild(gfx)
        gfx.destroy()
        pieceGraphics.delete(pieceId)
        continue
      }

      const margin = getPieceMargin(state)
      gfx.position.set(piece.x - margin, piece.y - margin)
    }

    // New group overlays.
    for (const [groupId, lock] of groupLocks) {
      if (groupOverlays.has(groupId)) {
        continue
      }

      const pieceIds = getCurrentGroupPieceIds(state, groupId)

      if (pieceIds.length === 0 || allPlaced(pieceIds)) {
        continue
      }

      const gfx = new Graphics({ label: `lock-group-${groupId}` })

      const overlay: GroupOverlay = {
        gfx,
        geometryKey: "",
        color: -1,
      }

      updateGroupOverlay(
        overlay,
        state,
        pieceIds,
        hexToGraphicsColor(lock.playerColor),
        FILL_ALPHA
      )

      groupOverlays.set(groupId, overlay)
      groupContainer.addChild(gfx)
    }

    // New piece overlays.
    for (const [, lock] of locks) {
      if (lock.targetType !== "piece") {
        continue
      }

      const pieceId = lock.targetId
      const piece = state.pieces[pieceId]

      if (!piece || piece.placed || lockedGroupIds.has(piece.groupId)) {
        continue
      }

      if (pieceGraphics.has(pieceId)) {
        continue
      }

      const def = state.definitions[pieceId]
      const view = pieces.byId.get(pieceId)

      if (!def || !view) {
        continue
      }

      const margin = getPieceMargin(state)
      const color = hexToGraphicsColor(lock.playerColor)
      const gfx = new Graphics({ label: `lock-piece-${pieceId}` })

      drawPieceOutline(gfx, def, margin, color, FILL_ALPHA)
      gfx.position.set(piece.x - margin, piece.y - margin)

      pieceGraphics.set(pieceId, gfx)
      pieceContainer.addChild(gfx)
    }
  }

  function destroy(): void {
    for (const [, overlay] of groupOverlays) {
      groupContainer.removeChild(overlay.gfx)
      overlay.gfx.destroy()
    }
    groupOverlays.clear()

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

function updateGroupOverlay(
  overlay: GroupOverlay,
  state: JigsawState,
  pieceIds: PieceId[],
  color: number,
  fillAlpha: number
): void {
  const bounds = getGroupBounds(state, pieceIds)

  if (!bounds) {
    overlay.gfx.visible = false
    return
  }

  overlay.gfx.visible = true

  const geometryKey = makeGroupGeometryKey(state, pieceIds, bounds)

  const shouldRebuild =
    overlay.geometryKey !== geometryKey || overlay.color !== color

  if (shouldRebuild) {
    overlay.gfx.clear()

    const ok = drawGroupOutlineLocal(
      overlay.gfx,
      state,
      pieceIds,
      bounds,
      color,
      fillAlpha
    )

    if (!ok) {
      drawGroupBoundsFallbackLocal(overlay.gfx, bounds, color, fillAlpha)
    }

    overlay.geometryKey = geometryKey
    overlay.color = color
  }

  // Это должно выполняться на каждый update.
  // Если группа просто двигается, geometryKey не меняется, и мы только двигаем overlay.
  overlay.gfx.position.set(bounds.x, bounds.y)
}

function getCurrentGroupPieceIds(
  state: JigsawState,
  groupId: string
): PieceId[] {
  const result = new Set<PieceId>()

  for (const pid of state.groups[groupId]?.pieceIds ?? []) {
    result.add(pid)
  }

  // Защита от рассинхрона: иногда piece.groupId уже обновился,
  // а groups[groupId].pieceIds ещё нет / или обновился позже.
  for (const [pid, piece] of Object.entries(state.pieces)) {
    if (piece?.groupId === groupId) {
      result.add(pid as PieceId)
    }
  }

  return [...result]
}

function makeGroupGeometryKey(
  state: JigsawState,
  pieceIds: PieceId[],
  bounds: GroupBounds
): string {
  return [...new Set(pieceIds)]
    .sort()
    .map((pid) => {
      const piece = state.pieces[pid]
      const def = state.definitions[pid]

      if (!piece || !def) {
        return `${pid}:missing`
      }

      return [
        pid,
        roundKey(piece.x - bounds.x),
        roundKey(piece.y - bounds.y),
        roundKey(def.width),
        roundKey(def.height),
      ].join(":")
    })
    .join("|")
}

function roundKey(value: number): number {
  return Math.round(value * 1000) / 1000
}

function getGroupBounds(
  state: JigsawState,
  pieceIds: PieceId[]
): GroupBounds | null {
  const margin = getPieceMargin(state)

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let found = false

  for (const pid of pieceIds) {
    const def = state.definitions[pid]
    const piece = state.pieces[pid]

    if (!def || !piece) {
      continue
    }

    found = true
    minX = Math.min(minX, piece.x - margin)
    minY = Math.min(minY, piece.y - margin)
    maxX = Math.max(maxX, piece.x + def.width + margin)
    maxY = Math.max(maxY, piece.y + def.height + margin)
  }

  if (!found) {
    return null
  }

  const width = maxX - minX
  const height = maxY - minY

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null
  }

  if (width <= 0 || height <= 0) {
    return null
  }

  return {
    x: minX,
    y: minY,
    width,
    height,
    margin,
  }
}

function drawGroupOutlineLocal(
  gfx: Graphics,
  state: JigsawState,
  pieceIds: PieceId[],
  bounds: GroupBounds,
  color: number,
  fillAlpha: number
): boolean {
  const loops = buildGroupOutlineLoops(state, pieceIds, bounds)

  if (loops.length === 0) {
    return false
  }

  gfx.fill({ color, alpha: fillAlpha })
  gfx.stroke({ width: OUTLINE_WIDTH, color, alpha: 0.9 })

  let drewAny = false

  for (const loop of loops) {
    if (loop.length < 2) {
      continue
    }

    const first = loop[0]
    gfx.moveTo(first.x1, first.y1)

    for (const edge of loop) {
      drawVectorOutlineEdge(gfx, edge)
    }

    gfx.closePath()
    drewAny = true
  }

  if (!drewAny) {
    return false
  }

  gfx.fill()
  gfx.stroke()

  return true
}

function buildGroupOutlineLoops(
  state: JigsawState,
  pieceIds: PieceId[],
  bounds: GroupBounds
): VectorOutlineEdge[][] {
  const uniquePieceIds = [...new Set(pieceIds)]
  const groupPieceIdSet = new Set(uniquePieceIds)
  const edges: VectorOutlineEdge[] = []

  for (const pieceId of uniquePieceIds) {
    const def = state.definitions[pieceId]
    const piece = state.pieces[pieceId]

    if (!def || !piece) {
      continue
    }

    const sides: EdgeSide[] = ["top", "right", "bottom", "left"]

    for (const side of sides) {
      const isInternal = hasGroupNeighborOnSide(
        state,
        pieceId,
        groupPieceIdSet,
        side
      )

      // Вот здесь и происходит "удаление внутренних".
      // Внутренние shared edges просто не попадают в render list.
      if (isInternal) {
        continue
      }

      const edge = makeVectorOutlineEdge(state, pieceId, side, bounds)

      if (edge) {
        edges.push(edge)
      }
    }
  }

  return traceVectorEdgeLoops(edges)
}

function hasGroupNeighborOnSide(
  state: JigsawState,
  pieceId: PieceId,
  groupPieceIdSet: Set<PieceId>,
  side: EdgeSide
): boolean {
  const piece = state.pieces[pieceId]
  const def = state.definitions[pieceId]

  if (!piece || !def) {
    return false
  }

  for (const otherId of groupPieceIdSet) {
    if (otherId === pieceId) {
      continue
    }

    const other = state.pieces[otherId]
    const otherDef = state.definitions[otherId]

    if (!other || !otherDef) {
      continue
    }

    if (side === "right") {
      const touchesRight =
        approxEqual(other.x, piece.x + def.width) &&
        rangesOverlapEnough(
          piece.y,
          piece.y + def.height,
          other.y,
          other.y + otherDef.height
        )

      if (touchesRight) {
        return true
      }
    }

    if (side === "left") {
      const touchesLeft =
        approxEqual(other.x + otherDef.width, piece.x) &&
        rangesOverlapEnough(
          piece.y,
          piece.y + def.height,
          other.y,
          other.y + otherDef.height
        )

      if (touchesLeft) {
        return true
      }
    }

    if (side === "bottom") {
      const touchesBottom =
        approxEqual(other.y, piece.y + def.height) &&
        rangesOverlapEnough(
          piece.x,
          piece.x + def.width,
          other.x,
          other.x + otherDef.width
        )

      if (touchesBottom) {
        return true
      }
    }

    if (side === "top") {
      const touchesTop =
        approxEqual(other.y + otherDef.height, piece.y) &&
        rangesOverlapEnough(
          piece.x,
          piece.x + def.width,
          other.x,
          other.x + otherDef.width
        )

      if (touchesTop) {
        return true
      }
    }
  }

  return false
}

function rangesOverlapEnough(
  a1: number,
  a2: number,
  b1: number,
  b2: number
): boolean {
  const overlap = Math.min(a2, b2) - Math.max(a1, b1)
  const minLength = Math.min(a2 - a1, b2 - b1)

  return overlap >= minLength - GROUP_EDGE_EPS
}

function approxEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= GROUP_EDGE_EPS
}

function makeVectorOutlineEdge(
  state: JigsawState,
  pieceId: PieceId,
  side: EdgeSide,
  bounds: GroupBounds
): VectorOutlineEdge | null {
  const def = state.definitions[pieceId]
  const piece = state.pieces[pieceId]

  if (!def || !piece) {
    return null
  }

  const x = piece.x - bounds.x
  const y = piece.y - bounds.y

  if (side === "top") {
    return {
      id: `${pieceId}:top`,
      pieceId,
      side,
      x1: x,
      y1: y,
      x2: x + def.width,
      y2: y,
      normalX: 0,
      normalY: -1,
      shape: def.edges.top,
      perpendicularLength: def.height,
    }
  }

  if (side === "right") {
    return {
      id: `${pieceId}:right`,
      pieceId,
      side,
      x1: x + def.width,
      y1: y,
      x2: x + def.width,
      y2: y + def.height,
      normalX: 1,
      normalY: 0,
      shape: def.edges.right,
      perpendicularLength: def.width,
    }
  }

  if (side === "bottom") {
    return {
      id: `${pieceId}:bottom`,
      pieceId,
      side,
      x1: x + def.width,
      y1: y + def.height,
      x2: x,
      y2: y + def.height,
      normalX: 0,
      normalY: 1,
      shape: def.edges.bottom,
      perpendicularLength: def.height,
    }
  }

  return {
    id: `${pieceId}:left`,
    pieceId,
    side,
    x1: x,
    y1: y + def.height,
    x2: x,
    y2: y,
    normalX: -1,
    normalY: 0,
    shape: def.edges.left,
    perpendicularLength: def.width,
  }
}

function traceVectorEdgeLoops(
  edges: VectorOutlineEdge[]
): VectorOutlineEdge[][] {
  const startMap = new Map<string, number[]>()

  for (let index = 0; index < edges.length; index++) {
    const edge = edges[index]
    const key = outlinePointKey(edge.x1, edge.y1)
    const list = startMap.get(key)

    if (list) {
      list.push(index)
    } else {
      startMap.set(key, [index])
    }
  }

  const used = new Set<number>()
  const loops: VectorOutlineEdge[][] = []

  for (let startIndex = 0; startIndex < edges.length; startIndex++) {
    if (used.has(startIndex)) {
      continue
    }

    const startEdge = edges[startIndex]
    const startKey = outlinePointKey(startEdge.x1, startEdge.y1)
    const loop: VectorOutlineEdge[] = []

    let currentIndex = startIndex
    let closed = false

    for (let guard = 0; guard <= edges.length; guard++) {
      if (used.has(currentIndex)) {
        break
      }

      const current = edges[currentIndex]
      used.add(currentIndex)
      loop.push(current)

      const endKey = outlinePointKey(current.x2, current.y2)

      if (endKey === startKey) {
        closed = true
        break
      }

      const candidates =
        startMap.get(endKey)?.filter((index) => !used.has(index)) ?? []

      if (candidates.length === 0) {
        break
      }

      currentIndex = chooseNextVectorEdgeIndex(current, candidates, edges)
    }

    if (closed && loop.length >= 2) {
      loops.push(loop)
    }
  }

  return loops
}

function outlinePointKey(x: number, y: number): string {
  return [Math.round(x / GROUP_EDGE_EPS), Math.round(y / GROUP_EDGE_EPS)].join(
    ":"
  )
}

function chooseNextVectorEdgeIndex(
  previous: VectorOutlineEdge,
  candidates: number[],
  edges: VectorOutlineEdge[]
): number {
  if (candidates.length === 1) {
    return candidates[0]
  }

  const previousAngle = Math.atan2(
    previous.y2 - previous.y1,
    previous.x2 - previous.x1
  )

  let bestIndex = candidates[0]
  let bestScore = Number.POSITIVE_INFINITY

  for (const candidateIndex of candidates) {
    const candidate = edges[candidateIndex]
    const nextAngle = Math.atan2(
      candidate.y2 - candidate.y1,
      candidate.x2 - candidate.x1
    )

    const turn = positiveAngleDelta(previousAngle, nextAngle)

    // Prefer continuing the outer walk:
    // straight/right-ish turns first, reverse last.
    const score =
      turn < 0.001 ? 1 : turn <= Math.PI ? turn : 10 + (Math.PI * 2 - turn)

    if (score < bestScore) {
      bestScore = score
      bestIndex = candidateIndex
    }
  }

  return bestIndex
}

function positiveAngleDelta(from: number, to: number): number {
  const full = Math.PI * 2
  return (((to - from) % full) + full) % full
}

function drawVectorOutlineEdge(gfx: Graphics, edge: VectorOutlineEdge): void {
  if (edge.shape.points.length === 0) {
    gfx.lineTo(edge.x2, edge.y2)
    return
  }

  const deltaX = edge.x2 - edge.x1
  const deltaY = edge.y2 - edge.y1
  const length = Math.hypot(deltaX, deltaY)

  if (length === 0) {
    return
  }

  const unitX = deltaX / length
  const unitY = deltaY / length

  for (let index = 1; index < edge.shape.points.length; index += 3) {
    const c1 = edgePointToWorld(
      edge.shape.points[index],
      edge.x1,
      edge.y1,
      unitX,
      unitY,
      edge.normalX,
      edge.normalY,
      length,
      edge.perpendicularLength
    )

    const c2 = edgePointToWorld(
      edge.shape.points[index + 1],
      edge.x1,
      edge.y1,
      unitX,
      unitY,
      edge.normalX,
      edge.normalY,
      length,
      edge.perpendicularLength
    )

    const end = edgePointToWorld(
      edge.shape.points[index + 2],
      edge.x1,
      edge.y1,
      unitX,
      unitY,
      edge.normalX,
      edge.normalY,
      length,
      edge.perpendicularLength
    )

    gfx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, end.x, end.y)
  }
}

function drawGroupBoundsFallbackLocal(
  gfx: Graphics,
  bounds: GroupBounds,
  color: number,
  fillAlpha: number
): void {
  const width = Math.max(1, bounds.width)
  const height = Math.max(1, bounds.height)

  gfx.fill({ color, alpha: fillAlpha })
  gfx.stroke({ width: OUTLINE_WIDTH, color, alpha: 0.9 })

  gfx.moveTo(0, 0)
  gfx.lineTo(width, 0)
  gfx.lineTo(width, height)
  gfx.lineTo(0, height)
  gfx.closePath()

  gfx.fill()
  gfx.stroke()
}

function drawPieceOutline(
  gfx: Graphics,
  def: PieceDefinition,
  margin: number,
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
  def: PieceDefinition,
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
  shape: PieceEdgeShape,
  perpendicularLength: number
): void {
  if (shape.points.length === 0) {
    gfx.lineTo(x2, y2)
    return
  }

  const deltaX = x2 - x1
  const deltaY = y2 - y1
  const length = Math.hypot(deltaX, deltaY)

  if (length === 0) {
    return
  }

  const unitX = deltaX / length
  const unitY = deltaY / length

  for (let index = 1; index < shape.points.length; index += 3) {
    const c1 = edgePointToWorld(
      shape.points[index],
      x1,
      y1,
      unitX,
      unitY,
      normalX,
      normalY,
      length,
      perpendicularLength
    )

    const c2 = edgePointToWorld(
      shape.points[index + 1],
      x1,
      y1,
      unitX,
      unitY,
      normalX,
      normalY,
      length,
      perpendicularLength
    )

    const end = edgePointToWorld(
      shape.points[index + 2],
      x1,
      y1,
      unitX,
      unitY,
      normalX,
      normalY,
      length,
      perpendicularLength
    )

    gfx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, end.x, end.y)
  }
}

function edgePointToWorld(
  point: PieceEdgePoint,
  x: number,
  y: number,
  unitX: number,
  unitY: number,
  normalX: number,
  normalY: number,
  length: number,
  perpendicularLength: number
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
