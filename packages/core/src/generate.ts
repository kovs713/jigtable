import type {
  GroupState,
  JigsawConfig,
  JigsawState,
  NeighborDirection,
  NeighborRelation,
  PieceDefinition,
  PieceEdge,
  PieceEdges,
  PieceEdgeShape,
  PieceId,
  PieceState,
} from "./types"

export function createJigsawState(config: JigsawConfig): JigsawState {
  const definitions: Record<PieceId, PieceDefinition> = {}
  const pieces: Record<PieceId, PieceState> = {}
  const groups: Record<string, GroupState> = {}
  const neighbors: NeighborRelation[] = []

  for (let row = 0; row < config.rows; row++) {
    for (let col = 0; col < config.cols; col++) {
      const id = getPieceId(row, col)
      const groupId = getInitialGroupId(id)
      const correctX = config.originX + col * config.pieceWidth
      const correctY = config.originY + row * config.pieceHeight

      definitions[id] = {
        id,
        row,
        col,
        correctX,
        correctY,
        width: config.pieceWidth,
        height: config.pieceHeight,
        color: createFakeImageColor(row, col, config.rows, config.cols),
        edges: createFlatPieceEdges(),
        neighbors: [],
      }

      pieces[id] = {
        id,
        groupId,
        x: correctX,
        y: correctY,
        placed: false,
        locked: false,
      }

      groups[groupId] = {
        id: groupId,
        pieceIds: [id],
        locked: false,
      }
    }
  }

  createJigsawEdges(definitions, config)

  for (let row = 0; row < config.rows; row++) {
    for (let col = 0; col < config.cols; col++) {
      addNeighbor(definitions, neighbors, row, col, row - 1, col, "up", config)
      addNeighbor(
        definitions,
        neighbors,
        row,
        col,
        row,
        col + 1,
        "right",
        config
      )
      addNeighbor(
        definitions,
        neighbors,
        row,
        col,
        row + 1,
        col,
        "down",
        config
      )
      addNeighbor(
        definitions,
        neighbors,
        row,
        col,
        row,
        col - 1,
        "left",
        config
      )
    }
  }

  return {
    config,
    definitions,
    pieces,
    groups,
    neighbors,
    snapCount: 0,
  }
}

function addNeighbor(
  definitions: Record<PieceId, PieceDefinition>,
  neighbors: NeighborRelation[],
  row: number,
  col: number,
  neighborRow: number,
  neighborCol: number,
  direction: NeighborDirection,
  config: JigsawConfig
): void {
  if (
    row < 0 ||
    col < 0 ||
    row >= config.rows ||
    col >= config.cols ||
    neighborRow < 0 ||
    neighborCol < 0 ||
    neighborRow >= config.rows ||
    neighborCol >= config.cols
  ) {
    return
  }

  const pieceId = getPieceId(row, col)
  const neighborId = getPieceId(neighborRow, neighborCol)
  const piece = definitions[pieceId]
  const neighbor = definitions[neighborId]

  if (!piece || !neighbor) {
    return
  }

  const relation = {
    id: `${pieceId}->${neighborId}`,
    pieceId,
    neighborId,
    direction,
    offsetX: neighbor.correctX - piece.correctX,
    offsetY: neighbor.correctY - piece.correctY,
  } satisfies NeighborRelation

  piece.neighbors.push(relation)
  neighbors.push(relation)
}

function getPieceId(row: number, col: number): PieceId {
  return `piece-${row}-${col}`
}

function getInitialGroupId(pieceId: PieceId): string {
  return `group-${pieceId}`
}

function createFlatPieceEdges(): PieceEdges {
  const flat = createFlatEdgeShape()

  return {
    top: flat,
    right: flat,
    bottom: flat,
    left: flat,
  }
}

function createJigsawEdges(
  definitions: Record<PieceId, PieceDefinition>,
  config: JigsawConfig
): void {
  for (let row = 0; row < config.rows - 1; row++) {
    const shapes = createCutLineShapes(config.cols, row, 0, config)

    for (let col = 0; col < config.cols; col++) {
      const shape = shapes[col]
      const topPiece = definitions[getPieceId(row, col)]
      const bottomPiece = definitions[getPieceId(row + 1, col)]

      if (!shape || !topPiece || !bottomPiece) {
        continue
      }

      topPiece.edges.bottom = shape
      bottomPiece.edges.top = reverseEdgeShape(shape)
    }
  }

  for (let col = 0; col < config.cols - 1; col++) {
    const shapes = createCutLineShapes(config.rows, col, 1, config)

    for (let row = 0; row < config.rows; row++) {
      const shape = shapes[row]
      const leftPiece = definitions[getPieceId(row, col)]
      const rightPiece = definitions[getPieceId(row, col + 1)]

      if (!shape || !leftPiece || !rightPiece) {
        continue
      }

      leftPiece.edges.right = shape
      rightPiece.edges.left = reverseEdgeShape(shape)
    }
  }
}

function createFlatEdgeShape(): PieceEdgeShape {
  return { sign: 0, points: [] }
}

function createCutLineShapes(
  count: number,
  lineIndex: number,
  axis: number,
  config: JigsawConfig
): PieceEdgeShape[] {
  const random = createLineRandom(lineIndex, axis, config.seed)
  const t = config.tabSizePercent / 200
  const j = config.jitterPercent / 100
  const shapes: PieceEdgeShape[] = []
  let flip: boolean | null = null
  let e = uniform(random, -j, j)

  for (let index = 0; index < count; index++) {
    const flipOld = flip
    flip = random() > 0.5
    const sign = (flip ? -1 : 1) as PieceEdge
    const a = flip === flipOld ? -e : e
    const b = uniform(random, -j, j)
    const c = uniform(random, -j, j)
    const d = uniform(random, -j, j)
    e = uniform(random, -j, j)

    shapes.push(createJigsawEdgeShape(sign, a, b, c, d, e, t))
  }

  return shapes
}

function createJigsawEdgeShape(
  sign: PieceEdge,
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  t: number
): PieceEdgeShape {
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

function reverseEdgeShape(shape: PieceEdgeShape): PieceEdgeShape {
  return {
    sign: invertEdge(shape.sign),
    points: shape.points
      .toReversed()
      .map((point) => ({ l: 1 - point.l, w: -point.w })),
  }
}

function invertEdge(edge: PieceEdge): PieceEdge {
  return (edge * -1) as PieceEdge
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

function createFakeImageColor(
  row: number,
  col: number,
  rows: number,
  cols: number
): number {
  const x = cols <= 1 ? 0 : col / (cols - 1)
  const y = rows <= 1 ? 0 : row / (rows - 1)
  const wave = Math.sin((x * 5.4 + y * 3.1) * Math.PI) * 0.5 + 0.5

  const red = clampColor(50 + x * 130 + wave * 42)
  const green = clampColor(70 + y * 120 + (1 - wave) * 34)
  const blue = clampColor(95 + (1 - x) * 88 + y * 36)

  return (red << 16) | (green << 8) | blue
}

function clampColor(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}
