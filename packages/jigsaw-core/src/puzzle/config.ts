import type { PuzzleConfig, WorldRect } from "./types"

export interface PuzzleSourceSize {
  width: number
  height: number
}

export const DEFAULT_PUZZLE_CONFIG = {
  rows: 25,
  cols: 40,
  pieceWidth: 48,
  pieceHeight: 36,
  originX: 0,
  originY: 0,
  scatterPadding: 620,
  scatterGap: 10,
  snapToCorrectDistance: 10,
  snapToNeighborDistance: 8,
  tabSizePercent: 20,
  jitterPercent: 0,
  pieceTextureScale: 6,
  minZoom: 0.18,
  maxZoom: 3.6,
  seed: 37_421,
} satisfies PuzzleConfig

export const PUZZLE_CONFIG_2000 = {
  ...DEFAULT_PUZZLE_CONFIG,
  rows: 10,
  cols: 15,
  pieceWidth: 38,
  pieceHeight: 30,
  scatterPadding: 760,
} satisfies PuzzleConfig

export function createImagePuzzleConfig(
  baseConfig: PuzzleConfig,
  sourceSize: PuzzleSourceSize
): PuzzleConfig {
  const sourceWidth = Math.max(1, sourceSize.width)
  const sourceHeight = Math.max(1, sourceSize.height)
  const sourceAspect = sourceWidth / sourceHeight
  const targetPieces = Math.max(1, baseConfig.rows * baseConfig.cols)
  const grid = chooseGridForAspect(targetPieces, sourceAspect)
  const targetArea =
    targetPieces * baseConfig.pieceWidth * baseConfig.pieceHeight
  const boardWidth = Math.sqrt(targetArea * sourceAspect)
  const boardHeight = boardWidth / sourceAspect

  return {
    ...baseConfig,
    rows: grid.rows,
    cols: grid.cols,
    pieceWidth: boardWidth / grid.cols,
    pieceHeight: boardHeight / grid.rows,
  }
}

export function getPuzzleBounds(config: PuzzleConfig): WorldRect {
  return {
    x: config.originX,
    y: config.originY,
    width: config.cols * config.pieceWidth,
    height: config.rows * config.pieceHeight,
  }
}

export function getPlayAreaBounds(config: PuzzleConfig): WorldRect {
  const board = getPuzzleBounds(config)
  const padding = getScatterPadding(config)

  return {
    x: board.x - padding,
    y: board.y - padding,
    width: board.width + padding * 2,
    height: board.height + padding * 2,
  }
}

export function getScatterVisualMargin(config: PuzzleConfig): number {
  const t = config.tabSizePercent / 200
  const j = config.jitterPercent / 100

  return Math.ceil(
    (3 * t + j) * Math.max(config.pieceWidth, config.pieceHeight) + 2
  )
}

function getScatterPadding(config: PuzzleConfig): number {
  const board = getPuzzleBounds(config)
  const margin = getScatterVisualMargin(config)
  const slotWidth = config.pieceWidth + margin * 2 + config.scatterGap
  const slotHeight = config.pieceHeight + margin * 2 + config.scatterGap
  const boardSlotsX = Math.max(1, Math.ceil(board.width / slotWidth))
  const boardSlotsY = Math.max(1, Math.ceil(board.height / slotHeight))
  const slotsPerRing = Math.max(1, 2 * (boardSlotsX + boardSlotsY) + 4)
  const rings = Math.ceil((config.rows * config.cols) / slotsPerRing)
  const ringPadding =
    rings * Math.max(slotWidth, slotHeight) + Math.max(slotWidth, slotHeight)

  return Math.max(config.scatterPadding, ringPadding)
}

function chooseGridForAspect(
  targetPieces: number,
  sourceAspect: number
): { rows: number; cols: number } {
  const idealCols = Math.sqrt(targetPieces * sourceAspect)
  const minCols = Math.max(1, Math.floor(idealCols * 0.55))
  const maxCols = Math.max(minCols, Math.ceil(idealCols * 1.65))
  let best = {
    rows: Math.max(
      1,
      Math.round(targetPieces / Math.max(1, Math.round(idealCols)))
    ),
    cols: Math.max(1, Math.round(idealCols)),
    score: Number.POSITIVE_INFINITY,
  }

  for (let cols = minCols; cols <= maxCols; cols++) {
    const rows = Math.max(1, Math.round(targetPieces / cols))
    const pieceCount = rows * cols
    const gridAspect = cols / rows
    const countError = Math.abs(pieceCount - targetPieces) / targetPieces
    const aspectError = Math.abs(Math.log(gridAspect / sourceAspect))
    const score = countError * 1.8 + aspectError

    if (score < best.score) {
      best = { rows, cols, score }
    }
  }

  return { rows: best.rows, cols: best.cols }
}
