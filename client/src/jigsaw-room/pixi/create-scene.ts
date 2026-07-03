import type { Application, Texture } from "pixi.js"
import { Container, Graphics, Sprite } from "pixi.js"

import { getJigsawBounds } from "@jigtable/jigsaw-core/jigsaw/config"
import type {
  JigsawState,
  PieceEdgePoint,
  PieceEdgeShape,
} from "@jigtable/jigsaw-core/jigsaw/types"

export interface SceneColors {
  boardFill: number
  boardStroke: number
  boardGrid: number
  previewStroke: number
  pieceStroke: number
  pieceHighlight: number
  placedStroke: number
}

export interface JigsawScene {
  world: Container
  boardLayer: Container
  piecesLayer: Container
  overlayLayer: Container
  setPreviewVisible: (visible: boolean) => void
}

export function createJigsawScene(
  app: Application,
  state: JigsawState,
  imageTexture: Texture,
  colors: SceneColors
): JigsawScene {
  const world = new Container({ label: "jigsaw-world" })
  const boardLayer = new Container({ label: "jigsaw-board-layer" })
  const piecesLayer = new Container({ label: "jigsaw-pieces-layer" })
  const overlayLayer = new Container({ label: "jigsaw-overlay-layer" })

  overlayLayer.eventMode = "none"

  boardLayer.addChild(createSolutionArea(state, colors))

  const preview = createPreviewOverlay(state, imageTexture, colors)
  preview.visible = false
  overlayLayer.addChild(preview)

  world.addChild(boardLayer, piecesLayer, overlayLayer)
  app.stage.addChild(world)

  return {
    world,
    boardLayer,
    piecesLayer,
    overlayLayer,
    setPreviewVisible(visible: boolean) {
      preview.visible = visible
    },
  }
}

export function readSceneColors(root: HTMLElement): SceneColors {
  const style = getComputedStyle(root)

  return {
    boardFill: readColor(style, "--jigsaw-pixi-board-fill", 0x101820),
    boardStroke: readColor(style, "--jigsaw-pixi-board-stroke", 0x6c7a89),
    boardGrid: readColor(style, "--jigsaw-pixi-board-grid", 0x344252),
    previewStroke: readColor(style, "--jigsaw-pixi-preview-stroke", 0xd8e6f2),
    pieceStroke: readColor(style, "--jigsaw-pixi-piece-stroke", 0x0a1018),
    pieceHighlight: readColor(style, "--jigsaw-pixi-piece-highlight", 0xffee88),
    placedStroke: readColor(style, "--jigsaw-pixi-placed-stroke", 0xc6f36a),
  }
}

function createSolutionArea(state: JigsawState, colors: SceneColors): Graphics {
  const board = getJigsawBounds(state.config)
  const area = new Graphics()

  area
    .rect(board.x, board.y, board.width, board.height)
    .fill({ color: colors.boardFill, alpha: 0.7 })

  area
    .rect(board.x, board.y, board.width, board.height)
    .stroke({ width: 2, color: colors.boardStroke, alpha: 0.95 })

  return area
}

function drawSolutionCutLines(area: Graphics, state: JigsawState): void {
  const definitions = Object.values(state.definitions)

  for (const definition of definitions) {
    if (definition.row < state.config.rows - 1) {
      drawEdge(
        area,
        definition.correctX,
        definition.correctY + definition.height,
        definition.correctX + definition.width,
        definition.correctY + definition.height,
        0,
        1,
        definition.edges.bottom,
        definition.height
      )
    }

    if (definition.col < state.config.cols - 1) {
      drawEdge(
        area,
        definition.correctX + definition.width,
        definition.correctY,
        definition.correctX + definition.width,
        definition.correctY + definition.height,
        1,
        0,
        definition.edges.right,
        definition.width
      )
    }
  }
}

function drawEdge(
  area: Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  normalX: number,
  normalY: number,
  shape: PieceEdgeShape,
  perpendicularLength: number
): void {
  area.moveTo(x1, y1)

  if (shape.points.length === 0) {
    area.lineTo(x2, y2)
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

    area.bezierCurveTo(
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

function createPreviewOverlay(
  state: JigsawState,
  imageTexture: Texture,
  colors: SceneColors
): Container {
  const board = getJigsawBounds(state.config)
  const preview = new Container({ label: "jigsaw-preview" })
  const image = new Sprite({ texture: imageTexture })
  const grid = new Graphics()
  const border = new Graphics()

  image.position.set(board.x, board.y)
  image.width = board.width
  image.height = board.height
  image.alpha = 0.42

  drawSolutionCutLines(grid, state)
  grid.stroke({ width: 1, color: colors.boardGrid, alpha: 0.72 })

  border
    .rect(board.x, board.y, board.width, board.height)
    .stroke({ width: 3, color: colors.previewStroke, alpha: 0.8 })

  preview.addChild(image, grid, border)

  return preview
}

function readColor(
  style: CSSStyleDeclaration,
  property: string,
  fallback: number
): number {
  const value = style.getPropertyValue(property).trim()

  if (!value) {
    return fallback
  }

  if (value.startsWith("#")) {
    const hex = value.slice(1)
    const normalized = hex.length === 3 ? hex.replace(/(.)/g, "$1$1") : hex
    const parsed = Number.parseInt(normalized, 16)

    return Number.isNaN(parsed) ? fallback : parsed
  }

  const rgb = value.match(/^rgba?\((.+)\)$/i)

  if (!rgb) {
    return fallback
  }

  const channels = rgb[1]
    .replaceAll(",", " ")
    .replaceAll("/", " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((channel) => Number.parseFloat(channel))

  if (
    channels.length < 3 ||
    channels.some((channel) => Number.isNaN(channel))
  ) {
    return fallback
  }

  return (
    (clampChannel(channels[0]) << 16) |
    (clampChannel(channels[1]) << 8) |
    clampChannel(channels[2])
  )
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}
