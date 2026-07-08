import { useEffect, useRef } from "react"

const GRID_COLOR = "rgba(255,255,255,0.35)"
const GRID_WIDTH = 1
const DEFAULT_SEED = 37_421
const DEFAULT_TAB_SIZE_PERCENT = 20

interface EdgePoint {
  l: number
  w: number
}

interface EdgeShape {
  sign: number
  points: EdgePoint[]
}

function createLineRandom(
  lineIndex: number,
  axis: number,
  seed: number
): () => number {
  let value = seed >>> 0

  value ^= Math.imul(lineIndex + 1, 374_761_393)
  value ^= Math.imul(axis + 1, 2_246_822_519)

  return () => {
    value ^= value << 13
    value ^= value >>> 17
    value ^= value << 5

    return (value >>> 0) / 0x1_0000_0000
  }
}

function uniform(random: () => number, min: number, max: number): number {
  return min + random() * (max - min)
}

function createEdgeShape(
  sign: number,
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  t: number
): EdgeShape {
  return {
    sign,
    points: [
      { l: 0, w: 0 },
      { l: 0.2, w: a * sign },
      { l: 0.5 + b + d, w: (-t + c) * sign },
      { l: 0.5 - t + b, w: (t + c) * sign },
      { l: 0.5 - 2 * t + b - d, w: (3 * t + c) * sign },
      { l: 0.5 + 2 * t + b - d, w: (3 * t + c) * sign },
      { l: 0.5 + t + b, w: (t + c) * sign },
      { l: 0.5 + b + d, w: (-t + c) * sign },
      { l: 0.8, w: e * sign },
      { l: 1, w: 0 },
    ],
  }
}

function createCutLineShapes(
  count: number,
  lineIndex: number,
  axis: number,
  seed: number,
  tabSizePercent: number
): EdgeShape[] {
  const random = createLineRandom(lineIndex, axis, seed)
  const t = tabSizePercent / 200
  const shapes: EdgeShape[] = []
  let flip: boolean | null = null
  let e = 0

  for (let index = 0; index < count; index++) {
    const flipOld = flip

    flip = random() > 0.5

    const sign = flip ? -1 : 1
    const a = flip === flipOld ? -e : e
    const b = uniform(random, -0, 0)
    const c = uniform(random, -0, 0)
    const d = uniform(random, -0, 0)

    e = uniform(random, -0, 0)
    shapes.push(createEdgeShape(sign, a, b, c, d, e, t))
  }

  return shapes
}

function reverseEdge(shape: EdgeShape): EdgeShape {
  return {
    sign: -shape.sign,
    points: shape.points
      .slice()
      .reverse()
      .map((p) => ({ l: 1 - p.l, w: -p.w })),
  }
}

function chooseGrid(pieceCount: number): { rows: number; cols: number } {
  const cols = Math.max(1, Math.round(Math.sqrt(pieceCount)))
  const rows = Math.max(1, Math.ceil(pieceCount / cols))

  return { rows, cols }
}

function edgePointToWorld(
  point: EdgePoint,
  x1: number,
  y1: number,
  unitX: number,
  unitY: number,
  normalX: number,
  normalY: number,
  length: number,
  perpLen: number
): { x: number; y: number } {
  return {
    x: x1 + unitX * point.l * length + normalX * point.w * perpLen,
    y: y1 + unitY * point.l * length + normalY * point.w * perpLen,
  }
}

function drawEdge(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  normalX: number,
  normalY: number,
  shape: EdgeShape,
  perpLen: number
): void {
  if (shape.points.length === 0) {
    ctx.lineTo(x2, y2)
    return
  }

  const deltaX = x2 - x1
  const deltaY = y2 - y1
  const length = Math.hypot(deltaX, deltaY)
  const unitX = deltaX / length
  const unitY = deltaY / length

  for (let i = 1; i < shape.points.length; i += 3) {
    const c1 = edgePointToWorld(
      shape.points[i], x1, y1, unitX, unitY, normalX, normalY, length, perpLen
    )
    const c2 = edgePointToWorld(
      shape.points[i + 1], x1, y1, unitX, unitY, normalX, normalY, length, perpLen
    )
    const end = edgePointToWorld(
      shape.points[i + 2], x1, y1, unitX, unitY, normalX, normalY, length, perpLen
    )

    ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, end.x, end.y)
  }
}

function generateAllEdges(
  rows: number,
  cols: number,
  seed: number,
  tabSizePercent: number
) {
  const horizontal: EdgeShape[][] = []

  for (let r = 0; r < rows - 1; r++) {
    horizontal.push(createCutLineShapes(cols, r, 0, seed, tabSizePercent))
  }

  const vertical: EdgeShape[][] = []

  for (let c = 0; c < cols - 1; c++) {
    vertical.push(createCutLineShapes(rows, c, 1, seed, tabSizePercent))
  }

  return { horizontal, vertical }
}

function getEdge(
  row: number,
  col: number,
  dir: "top" | "right" | "bottom" | "left",
  rows: number,
  cols: number,
  horizontal: EdgeShape[][],
  vertical: EdgeShape[][]
): EdgeShape {
  if (dir === "top") {
    return row === 0
      ? { sign: 0, points: [] }
      : reverseEdge(horizontal[row - 1][col])
  }
  if (dir === "bottom") {
    return row === rows - 1
      ? { sign: 0, points: [] }
      : horizontal[row][col]
  }
  if (dir === "left") {
    return col === 0
      ? { sign: 0, points: [] }
      : reverseEdge(vertical[col - 1][row])
  }
  // right
  return col === cols - 1
    ? { sign: 0, points: [] }
    : vertical[col][row]
}

export function HistoryPreview({
  imageUrl,
  pieceCount,
  maxWidth = 280,
  className,
}: {
  imageUrl: string
  pieceCount: number
  maxWidth?: number
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) return

    const ctx = canvas.getContext("2d")

    if (!ctx) return

    let cancelled = false
    const img = new Image()

    img.crossOrigin = "anonymous"

    img.onload = () => {
      if (cancelled) return

      const aspect = img.naturalHeight / img.naturalWidth
      const w = maxWidth
      const h = Math.round(w * aspect)

      canvas.width = w
      canvas.height = h

      const { rows, cols } = chooseGrid(pieceCount)
      const cellW = w / cols
      const cellH = h / rows
      const perpLen = Math.max(cellW, cellH) * 0.1

      const { horizontal, vertical } = generateAllEdges(
        rows, cols, DEFAULT_SEED, DEFAULT_TAB_SIZE_PERCENT
      )

      ctx.save()
      ctx.beginPath()

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * cellW
          const y = r * cellH

          const top = getEdge(r, c, "top", rows, cols, horizontal, vertical)
          const right = getEdge(r, c, "right", rows, cols, horizontal, vertical)
          const bottom = getEdge(r, c, "bottom", rows, cols, horizontal, vertical)
          const left = getEdge(r, c, "left", rows, cols, horizontal, vertical)

          ctx.moveTo(x, y)
          drawEdge(ctx, x, y, x + cellW, y, 0, 1, top, perpLen)
          drawEdge(ctx, x + cellW, y, x + cellW, y + cellH, -1, 0, right, perpLen)
          drawEdge(ctx, x + cellW, y + cellH, x, y + cellH, 0, -1, bottom, perpLen)
          drawEdge(ctx, x, y + cellH, x, y, 1, 0, left, perpLen)
          ctx.closePath()
        }
      }

      ctx.clip()
      ctx.drawImage(img, 0, 0, w, h)
      ctx.restore()

      ctx.strokeStyle = GRID_COLOR
      ctx.lineWidth = GRID_WIDTH

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * cellW
          const y = r * cellH

          const top = getEdge(r, c, "top", rows, cols, horizontal, vertical)
          const right = getEdge(r, c, "right", rows, cols, horizontal, vertical)
          const bottom = getEdge(r, c, "bottom", rows, cols, horizontal, vertical)
          const left = getEdge(r, c, "left", rows, cols, horizontal, vertical)

          ctx.beginPath()
          ctx.moveTo(x, y)
          drawEdge(ctx, x, y, x + cellW, y, 0, 1, top, perpLen)
          drawEdge(ctx, x + cellW, y, x + cellW, y + cellH, -1, 0, right, perpLen)
          drawEdge(ctx, x + cellW, y + cellH, x, y + cellH, 0, -1, bottom, perpLen)
          drawEdge(ctx, x, y + cellH, x, y, 1, 0, left, perpLen)
          ctx.closePath()
          ctx.stroke()
        }
      }
    }

    img.src = imageUrl

    return () => {
      cancelled = true
    }
  }, [imageUrl, pieceCount, maxWidth])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
    />
  )
}
