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
  maxWidth,
  className,
}: {
  imageUrl: string
  pieceCount: number
  jigsawConfig?: JigsawConfig | null
  maxWidth?: number
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const wrapper = wrapperRef.current

    if (!canvas || !wrapper) return

    let cancelled = false
    let img: HTMLImageElement | null = null

    function draw(): void {
      if (cancelled) return

      const canvas = canvasRef.current
      const wrapper = wrapperRef.current

      if (!canvas || !wrapper) return

      const ctx = canvas.getContext("2d")

      if (!ctx || !img) return

      if (!img.complete || img.naturalWidth === 0) return

      const availableW = wrapper.clientWidth
      const availableH = wrapper.clientHeight
      const imgAspect = img.naturalHeight / img.naturalWidth
      let w: number
      let h: number

      if (maxWidth && maxWidth > 0) {
        w = Math.min(maxWidth, availableW)
        h = Math.round(w * imgAspect)
      } else {
        w = availableW
        h = Math.min(Math.round(w * imgAspect), availableH)
      }

      if (w <= 0 || h <= 0) return

      canvas.width = w
      canvas.height = h

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

    img = new Image()

    img.onload = draw

    const observer = new ResizeObserver(() => {
      draw()
    })

    observer.observe(wrapper)
    img.src = imageUrl

    return () => {
      cancelled = true
      img = null
      observer.disconnect()
    }
  }, [imageUrl, jigsawConfig, maxWidth, pieceCount])

  return (
    <div ref={wrapperRef} className="jigsaw-room__canvas-wrapper">
      <canvas ref={canvasRef} className={className} aria-hidden="true" />
    </div>
  )
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
      x1, y1, unitX, unitY, normalX, normalY, length, perpendicularLength
    )
    const control2 = edgePointToWorld(
      shape.points[index + 1],
      x1, y1, unitX, unitY, normalX, normalY, length, perpendicularLength
    )
    const end = edgePointToWorld(
      shape.points[index + 2],
      x1, y1, unitX, unitY, normalX, normalY, length, perpendicularLength
    )

    ctx.bezierCurveTo(control1.x, control1.y, control2.x, control2.y, end.x, end.y)
  }
}

function edgePointToWorld(
  point: PieceEdgePoint,
  x: number, y: number, unitX: number, unitY: number,
  normalX: number, normalY: number, length: number, perpendicularLength: number
): { x: number; y: number } {
  return {
    x: x + unitX * point.l * length + normalX * point.w * perpendicularLength,
    y: y + unitY * point.l * length + normalY * point.w * perpendicularLength,
  }
}
