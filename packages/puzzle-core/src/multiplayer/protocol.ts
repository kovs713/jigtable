import type {
  GroupId,
  GroupState,
  PieceId,
  PieceState,
  PuzzleConfig,
  PuzzleState,
} from "../puzzle/types"

export interface PuzzlePlayer {
  id: string
  name: string
  color: string
}

export interface PuzzleSession {
  token: string
  player: PuzzlePlayer
  createdAt: number
  updatedAt: number
}

export interface PuzzleGroupLock {
  groupId: GroupId
  playerId: string
  playerName: string
  lockedAt: number
}

export interface PuzzlePlayerCursor {
  playerId: string
  playerName: string
  color: string
  x: number
  y: number
  updatedAt: number
}

export interface PuzzleRoomTimer {
  elapsedMs: number
  paused: boolean
  updatedAt: number
  pausedByPlayerId?: string
  pausedByPlayerName?: string
}

export interface PuzzleRoomStats {
  totalPieces: number
  placedPieces: number
  groupsCount: number
  playersCount: number
  snapCount: number
}

export interface PuzzleRoomSnapshot {
  roomId: string
  puzzle: {
    assetId: string
    imageUrl: string
    config: PuzzleConfig
  }
  pieces: PuzzleState["pieces"]
  groups: PuzzleState["groups"]
  players: PuzzlePlayer[]
  locks: PuzzleGroupLock[]
  cursors: PuzzlePlayerCursor[]
  timer: PuzzleRoomTimer
  stats: PuzzleRoomStats
  createdAt: number
  updatedAt: number
}

export interface CreatePuzzleRoomRequest {
  imageUrl: string
  assetId?: string
  pieceCount: number
  sourceWidth?: number
  sourceHeight?: number
}

export interface CreatePuzzleRoomResponse {
  roomId: string
  joinUrl: string
  state: PuzzleRoomSnapshot
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
  | { type: "room:state"; state: PuzzleRoomSnapshot }
  | { type: "player:joined"; player: PuzzlePlayer; playersCount: number }
  | { type: "player:updated"; player: PuzzlePlayer }
  | { type: "player:left"; playerId: string; playersCount: number }
  | { type: "cursor:moved"; cursor: PuzzlePlayerCursor }
  | { type: "cursor:hidden"; playerId: string }
  | { type: "session:paused"; timer: PuzzleRoomTimer }
  | { type: "session:resumed"; timer: PuzzleRoomTimer }
  | { type: "group:locked"; lock: PuzzleGroupLock }
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
  | { type: "stats:updated"; stats: PuzzleRoomStats }
  | { type: "error"; code: string; message: string }
