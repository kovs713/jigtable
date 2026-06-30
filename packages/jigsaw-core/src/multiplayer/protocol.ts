import type {
  GroupId,
  GroupState,
  PieceId,
  PieceState,
  PuzzleConfig,
  PuzzleState,
} from "../puzzle/types"

export interface JigsawPlayer {
  id: string
  name: string
  color: string
}

export interface JigsawSession {
  token: string
  player: JigsawPlayer
  createdAt: number
  updatedAt: number
}

export interface JigsawGroupLock {
  groupId: GroupId
  playerId: string
  playerName: string
  lockedAt: number
}

export interface JigsawPlayerCursor {
  playerId: string
  playerName: string
  color: string
  x: number
  y: number
  updatedAt: number
}

export interface JigsawRoomTimer {
  elapsedMs: number
  paused: boolean
  updatedAt: number
  pausedByPlayerId?: string
  pausedByPlayerName?: string
}

export interface JigsawRoomStats {
  totalPieces: number
  placedPieces: number
  groupsCount: number
  playersCount: number
  snapCount: number
}

export interface JigsawRoomSnapshot {
  roomId: string
  puzzle: {
    assetId: string
    imageUrl: string
    config: PuzzleConfig
  }
  pieces: PuzzleState["pieces"]
  groups: PuzzleState["groups"]
  players: JigsawPlayer[]
  locks: JigsawGroupLock[]
  cursors: JigsawPlayerCursor[]
  timer: JigsawRoomTimer
  stats: JigsawRoomStats
  createdAt: number
  updatedAt: number
}

export interface CreateJigsawRoomRequest {
  imageUrl: string
  assetId?: string
  pieceCount: number
  sourceWidth?: number
  sourceHeight?: number
}

export interface CreateJigsawRoomResponse {
  roomId: string
  joinUrl: string
  state: JigsawRoomSnapshot
}

export type ClientToServerMessage =
  | { type: "room:join"; roomId: string; sessionToken: string }
  | { type: "room:request_state" }
  | { type: "group:grab"; groupId: GroupId }
  | { type: "group:move"; groupId: GroupId; x: number; y: number }
  | { type: "group:drop"; groupId: GroupId; x: number; y: number }
  | { type: "group:release"; groupId: GroupId }
  | { type: "cursor:move"; x: number; y: number }
  | { type: "cursor:hide" }
  | { type: "session:pause" }
  | { type: "session:resume" }

export type ServerToClientMessage =
  | { type: "room:state"; state: JigsawRoomSnapshot }
  | { type: "player:joined"; player: JigsawPlayer; playersCount: number }
  | { type: "player:updated"; player: JigsawPlayer }
  | { type: "player:left"; playerId: string; playersCount: number }
  | { type: "cursor:moved"; cursor: JigsawPlayerCursor }
  | { type: "cursor:hidden"; playerId: string }
  | { type: "session:paused"; timer: JigsawRoomTimer }
  | { type: "session:resumed"; timer: JigsawRoomTimer }
  | { type: "group:locked"; lock: JigsawGroupLock }
  | { type: "group:unlocked"; groupId: GroupId; playerId: string }
  | {
      type: "group:moved"
      groupId: GroupId
      playerId: string
      x: number
      y: number
      affectedPieceIds: PieceId[]
      final?: boolean
    }
  | {
      type: "groups:merged"
      groupId: GroupId
      removedGroupIds: GroupId[]
      groups: Record<GroupId, GroupState>
      pieces: Record<PieceId, PieceState>
      snapCount: number
    }
  | {
      type: "pieces:placed"
      groupId: GroupId
      pieces: Record<PieceId, PieceState>
      groups: Record<GroupId, GroupState>
      snapCount: number
    }
  | { type: "stats:updated"; stats: JigsawRoomStats }
  | { type: "error"; code: string; message: string }
