import type {
  PieceDefinition,
  PieceEdgePoint,
  PieceEdgeShape,
  PiecePathSink,
} from "./types"

export function tracePiecePath(
  definition: PieceDefinition,
  path: PiecePathSink,
  offsetX = 0,
  offsetY = 0
): void {
  const width = definition.width
  const height = definition.height

  path.moveTo(offsetX, offsetY)
  traceEdge(
    path,
    offsetX,
    offsetY,
    offsetX + width,
    offsetY,
    0,
    -1,
    definition.edges.top,
    height
  )
  traceEdge(
    path,
    offsetX + width,
    offsetY,
    offsetX + width,
    offsetY + height,
    1,
    0,
    definition.edges.right,
    width
  )
  traceEdge(
    path,
    offsetX + width,
    offsetY + height,
    offsetX,
    offsetY + height,
    0,
    1,
    definition.edges.bottom,
    height
  )
  traceEdge(
    path,
    offsetX,
    offsetY + height,
    offsetX,
    offsetY,
    -1,
    0,
    definition.edges.left,
    width
  )
  path.closePath()
}

function traceEdge(
  path: PiecePathSink,
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
    path.lineTo(x2, y2)
    return
  }

  const deltaX = x2 - x1
  const deltaY = y2 - y1
  const length = Math.hypot(deltaX, deltaY)

  if (length === 0) {
    path.lineTo(x2, y2)
    return
  }

  const unitX = deltaX / length
  const unitY = deltaY / length

  for (let index = 1; index + 2 < shape.points.length; index += 3) {
    const control1 = edgePointToWorld(
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
    const control2 = edgePointToWorld(
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

    path.bezierCurveTo(
      control1.x,
      control1.y,
      control2.x,
      control2.y,
      end.x,
      end.y
    )
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
