import { useEffect, useRef } from "react"

const GRID_COLOR = "rgba(255,255,255,0.35)"
const GRID_WIDTH = 1

function chooseGrid(pieceCount: number): { rows: number; cols: number } {
  const cols = Math.max(1, Math.round(Math.sqrt(pieceCount)))
  const rows = Math.max(1, Math.ceil(pieceCount / cols))

  return { rows, cols }
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
      ctx.drawImage(img, 0, 0, w, h)

      const { rows, cols } = chooseGrid(pieceCount)
      const cellW = w / cols
      const cellH = h / rows

      ctx.strokeStyle = GRID_COLOR
      ctx.lineWidth = GRID_WIDTH

      for (let c = 1; c < cols; c++) {
        const x = Math.round(c * cellW) + 0.5

        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
        ctx.stroke()
      }

      for (let r = 1; r < rows; r++) {
        const y = Math.round(r * cellH) + 0.5

        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
        ctx.stroke()
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
