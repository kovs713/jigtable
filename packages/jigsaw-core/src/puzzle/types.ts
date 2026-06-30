export type PieceId = string
export type GroupId = string

export type NeighborDirection = "up" | "right" | "down" | "left"
export type PieceEdge = -1 | 0 | 1

export interface PieceEdgePoint {
  l: number
  w: number
}

export interface PieceEdgeShape {
  sign: PieceEdge
  points: PieceEdgePoint[]
}

export interface PieceEdges {
  top: PieceEdgeShape
  right: PieceEdgeShape
  bottom: PieceEdgeShape
  left: PieceEdgeShape
}

export interface WorldRect {
  x: number
  y: number
  width: number
  height: number
}

export interface NeighborRelation {
  id: string
  pieceId: PieceId
  neighborId: PieceId
  direction: NeighborDirection
  offsetX: number
  offsetY: number
}

export interface PieceDefinition {
  id: PieceId
  row: number
  col: number
  correctX: number
  correctY: number
  width: number
  height: number
  color: number
  edges: PieceEdges
  neighbors: NeighborRelation[]
}

export interface PieceState {
  id: PieceId
  groupId: GroupId
  x: number
  y: number
  placed: boolean
  locked: boolean
}

export interface GroupState {
  id: GroupId
  pieceIds: PieceId[]
  locked: boolean
}

export interface PuzzleConfig {
  rows: number
  cols: number
  pieceWidth: number
  pieceHeight: number
  originX: number
  originY: number
  scatterPadding: number
  scatterGap: number
  snapToCorrectDistance: number
  snapToNeighborDistance: number
  tabSizePercent: number
  jitterPercent: number
  pieceTextureScale: number
  minZoom: number
  maxZoom: number
  seed: number
}

export interface PuzzleState {
  config: PuzzleConfig
  definitions: Record<PieceId, PieceDefinition>
  pieces: Record<PieceId, PieceState>
  groups: Record<GroupId, GroupState>
  neighbors: NeighborRelation[]
  snapCount: number
}

export interface PuzzleStats {
  fps: number
  zoom: number
  totalPieces: number
  placedPieces: number
  groupsCount: number
  snapCount: number
}
