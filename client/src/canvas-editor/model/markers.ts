import { IMAGE_MARKER_COUNT } from "./constants"

type MarkerStyle = Record<`--${string}`, string>

type Rectangle = {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export function getImageAriaLabel(index: number): string {
  return `Item ${getImageMarkerCode(index)}`
}

export function getImageMarkerStyle(index: number): MarkerStyle {
  return {
    "--image-marker": `var(--image-marker-${(index % IMAGE_MARKER_COUNT) + 1})`,
  }
}

export function getCanvasMarkerStyle(): MarkerStyle {
  return { "--image-marker": "var(--primary)" }
}

export function getImageMarkerCode(index: number): string {
  return String(index + 1).padStart(2, "0")
}

export function getConnectorPath(from: Rectangle, to: Rectangle): string {
  const fromCenterX = from.left + from.width / 2
  const fromCenterY = from.top + from.height / 2
  const toCenterX = to.left + to.width / 2
  const toCenterY = to.top + to.height / 2
  let x1 = from.right
  let y1 = fromCenterY
  let x2 = to.left
  let y2 = toCenterY

  if (to.right < from.left) {
    x1 = from.left
    x2 = to.right
  } else if (from.bottom < to.top) {
    x1 = fromCenterX
    y1 = from.bottom
    x2 = toCenterX
    y2 = to.top
  } else if (to.bottom < from.top) {
    x1 = fromCenterX
    y1 = from.top
    x2 = toCenterX
    y2 = to.bottom
  }

  const midX = x1 + (x2 - x1) / 2
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
}
