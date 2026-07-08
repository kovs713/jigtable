import { useEffect, useRef } from "react"

import {
  createImageJigsawConfig,
  createJigsawState,
  getJigsawBounds,
  JIGSAW_CONFIG_2000,
  type JigsawConfig,
  type PieceEdgePoint,
  type PieceEdgeShape,
} from "@jigtable/jigsaw-core"

const STROKE_COLOR = "rgba(255,255,255,0.36)"
const STROKE_WIDTH = 1

export function HistoryPreview({
  imageUrl,
  pieceCount,
  jigsawConfig,
  maxWidth = 280,
  className,
}: {
  imageUrl: string
  pieceCount: number
  jigsawConfig?: JigsawConfig | null
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

    img.onload = () => {
      if (cancelled) return

      const w = maxWidth
      const h = Math.round(w * (img.naturalHeight / img.naturalWidth))
      const config =
        jigsawConfig ??
        createImageJigsawConfig(
          {
            ...JIGSAW_CONFIG_2000,
            rows: 1,
            cols: Math.max(4, Math.min(2_000, Math.round(pieceCount))),
          },
          { width: img.naturalWidth, height: img.naturalHeight }
        )
      const state = createJigsawState(config)
      const board = getJigsawBounds(config)
      const scaleX = w / board.width
      const scaleY = h / board.height

      canvas.width = w
      canvas.height = h

      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)

      ctx.strokeStyle = STROKE_COLOR
      ctx.lineWidth = STROKE_WIDTH

      for (const definition of Object.values(state.definitions)) {
        if (definition.row < config.rows - 1) {
          drawEdge(
            ctx,
            (definition.correctX - board.x) * scaleX,
            (definition.correctY + definition.height - board.y) * scaleY,
            (definition.correctX + definition.width - board.x) * scaleX,
            (definition.correctY + definition.height - board.y) * scaleY,
             0,
            1,
            definition.edges.bottom,
            definition.height * scaleY
          )
        }

        if (definition.col < config.cols - 1) {
          drawEdge(
            ctx,
            (definition.correctX + definition.width - board.x) * scaleX,
            (definition.correctY - board.y) * scaleY,
            (definition.correctX + definition.width - board.x) * scaleX,
            (definition.correctY + definition.height - board.y) * scaleY,
            1,
            0,
            definition.edges.right,
            definition.width * scaleX
          )
        }
      }

      ctx.stroke()
    }

    img.src = imageUrl

    return () => {
      cancelled = true
    }
  }, [imageUrl, jigsawConfig, maxWidth, pieceCount])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}

function drawEdge(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  normalX: number,
  normalY: number,
  shape: PieceEdgeShape,
  perpendicularLength: number
): void {
  ctx.moveTo(x1, y1)

  if (shape.points.length === 0) {
    ctx.lineTo(x2, y2)
    return
  }

  const deltaX = x2 - x1
  const deltaY = y2 - y1
  const length = Math.hypot(deltaX, deltaY)
  const unitX = deltaX / length
  const unitY = deltaY / length

  for (let index = 1; index < shape.points.length; index += 3) {
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

    ctx.bezierCurveTo(control1.x, control1.y, control2.x, control2.y, end.x, end.y)
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
