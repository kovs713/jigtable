import type { Application, Texture } from "pixi.js"
import { Container, Graphics, Sprite } from "pixi.js"

import { getJigsawBounds } from "@jigtable/jigsaw-core/jigsaw/config"
import type { JigsawState } from "@jigtable/jigsaw-core/jigsaw/types"

export interface SceneColors {
  boardFill: number
  boardStroke: number
  boardGrid: number
  previewOverlay: number
  previewOverlayAlpha: number
  pieceHighlight: number
  placedStroke: number
}

export interface JigsawScene {
  world: Container
  boardLayer: Container
  piecesLayer: Container
  overlayLayer: Container
  setPreviewVisible: (visible: boolean) => void
  setColors: (colors: SceneColors) => void
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

  const solutionArea = new Graphics()
  drawSolutionArea(solutionArea, state, colors)
  boardLayer.addChild(solutionArea)

  const previewOverlay = new Graphics()
  const preview = createPreviewOverlay(
    state,
    imageTexture,
    colors,
    previewOverlay,
  )
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
    setColors(nextColors: SceneColors) {
      drawSolutionArea(solutionArea, state, nextColors)
      drawPreviewOverlay(previewOverlay, state, nextColors)
    },
  }
}

export function readSceneColors(root: HTMLElement): SceneColors {
  const style = getComputedStyle(root)

  return {
    boardFill: readColor(style, "--jigsaw-pixi-board-fill", 0x101820),
    boardStroke: readColor(style, "--jigsaw-pixi-board-stroke", 0x6c7a89),
    boardGrid: readColor(style, "--jigsaw-pixi-board-grid", 0x344252),
    previewOverlay: readColor(style, "--jigsaw-pixi-preview-overlay", 0xffffff),
    previewOverlayAlpha: readNumber(
      style,
      "--jigsaw-pixi-preview-overlay-alpha",
      0.12
    ),
    pieceHighlight: readColor(style, "--jigsaw-pixi-piece-highlight", 0xffee88),
    placedStroke: readColor(style, "--jigsaw-pixi-placed-stroke", 0xc6f36a),
  }
}

function drawSolutionArea(
  area: Graphics,
  state: JigsawState,
  colors: SceneColors
): void {
  const board = getJigsawBounds(state.config)

  area
    .clear()
    .rect(board.x, board.y, board.width, board.height)
    .fill({ color: colors.boardFill, alpha: 0.7 })

  area
    .rect(board.x, board.y, board.width, board.height)
    .stroke({ width: 2, color: colors.boardStroke, alpha: 0.95 })
}

function createPreviewOverlay(
  state: JigsawState,
  imageTexture: Texture,
  colors: SceneColors,
  overlay: Graphics,
): Container {
  const board = getJigsawBounds(state.config)
  const preview = new Container({ label: "jigsaw-preview" })
  const image = new Sprite({ texture: imageTexture })

  image.position.set(board.x, board.y)
  image.width = board.width
  image.height = board.height
  image.alpha = 0.42

  drawPreviewOverlay(overlay, state, colors)

  preview.addChild(image, overlay)

  return preview
}

function drawPreviewOverlay(
  overlay: Graphics,
  state: JigsawState,
  colors: SceneColors
): void {
  const board = getJigsawBounds(state.config)

  overlay
    .clear()
    .rect(board.x, board.y, board.width, board.height)
    .fill({ color: colors.previewOverlay, alpha: colors.previewOverlayAlpha })
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

function readNumber(
  style: CSSStyleDeclaration,
  property: string,
  fallback: number
): number {
  const parsed = Number.parseFloat(style.getPropertyValue(property).trim())

  return Number.isNaN(parsed) ? fallback : parsed
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}
