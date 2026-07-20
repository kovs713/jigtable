import type { ArrangeLoosePiecesMode } from "./scatter"
import type {
  GroupId,
  GroupState,
  JigsawConfig,
  JigsawState,
  PieceId,
  PieceState,
} from "./types"

export interface Player {
  id: string
  name: string
  color: string
}

export interface PlayerSession {
  token: string
  player: Player
  createdAt: number
  updatedAt: number
}

export const CHAT_MESSAGE_MAX_LENGTH = 300

export interface ChatMessage {
  id: string
  player: Player
  text: string
  createdAt: number
  cursor?: {
    x: number
    y: number
  }
}

export interface JigsawGroupLock {
  groupId: GroupId
  playerId: string
  playerName: string
  lockedAt: number
}

export interface JigsawLock {
  targetType: "piece" | "group"
  targetId: string
  playerId: string
  playerName: string
  playerColor: string
  lockedAt: number
  connectionId: string
}

export interface PlayerCursor {
  playerId: string
  playerName: string
  color: string
  x: number
  y: number
  updatedAt: number
}

export interface RoomTimer {
  elapsedMs: number
  paused: boolean
  updatedAt: number
  pausedByPlayerId?: string
  pausedByPlayerName?: string
}

export interface RoomStats {
  totalPieces: number
  placedPieces: number
  groupsCount: number
  playersCount: number
  snapCount: number
}

export interface RoomSnapshot {
  roomId: string
  jigsaw: {
    assetId: string
    imageUrl: string
    config: JigsawConfig
  }
  pieces: JigsawState["pieces"]
  groups: JigsawState["groups"]
  players: Player[]
  locks: JigsawLock[]
  cursors: PlayerCursor[]
  timer: RoomTimer
  stats: RoomStats
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
  state: RoomSnapshot
}

export type ClientToServerMessage =
  | { type: "room:join"; roomId: string; sessionToken: string }
  | { type: "room:request_state" }
  | { type: "room:ping"; commandId: string; id: string; x: number; y: number }
  | { type: "group:grab"; groupId: GroupId }
  | { type: "group:move"; groupId: GroupId; x: number; y: number }
  | {
      type: "group:drop"
      commandId: string
      groupId: GroupId
      x: number
      y: number
    }
  | { type: "group:release"; groupId: GroupId }
  | { type: "groups:arrange"; mode: ArrangeLoosePiecesMode }
  | {
      type: "room:lock-toggle"
      commandId: string
      targetType: "piece" | "group"
      targetId: string
    }
  | { type: "cursor:move"; x: number; y: number }
  | { type: "cursor:hide" }
  | { type: "session:pause" }
  | { type: "session:resume" }
  | { type: "room:preview:open"; commandId: string }
  | { type: "room:preview:close"; commandId: string }
  | { type: "chat:send"; text: string; x?: number; y?: number }

export type ServerToClientMessage =
  | { type: "room:state"; state: RoomSnapshot }
  | { type: "player:joined"; player: Player; playersCount: number }
  | { type: "player:updated"; player: Player }
  | { type: "player:left"; playerId: string; playersCount: number }
  | { type: "cursor:moved"; cursor: PlayerCursor }
  | { type: "cursor:hidden"; playerId: string }
  | { type: "session:paused"; timer: RoomTimer }
  | { type: "session:resumed"; timer: RoomTimer }
  | { type: "group:locked"; lock: JigsawGroupLock }
  | { type: "group:unlocked"; groupId: GroupId; playerId: string }
  | {
      type: "room:lock-updated"
      targetType: "piece" | "group"
      targetId: string
      lockedBy: { userId: string; name: string; color: string } | null
    }
  | {
      type: "room:lock-rejected"
      targetType: "piece" | "group"
      targetId: string
      reason: "already_locked"
      lockedBy: { userId: string; name: string; color: string }
    }
  | {
      type: "room:lock-rejected"
      targetType: "piece" | "group"
      targetId: string
      reason: "already_placed"
      lockedBy: null
    }
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
  | { type: "groups:arranged"; pieces: Record<PieceId, PieceState> }
  | { type: "stats:updated"; stats: RoomStats }
  | {
      type: "room:pinged"
      id: string
      userId: string
      userName?: string
      userColor?: string
      x: number
      y: number
      createdAt: number
    }
  | { type: "chat:message"; message: ChatMessage }
  | { type: "error"; code: string; message: string }

export type ClientMessageType = ClientToServerMessage["type"]
export type ServerMessageType = ServerToClientMessage["type"]
export type WsMessageType = ClientMessageType | ServerMessageType

function defineMessageTypes<Message extends { type: string }>() {
  return <const Types extends readonly Message["type"][]>(
    types: Exclude<Message["type"], Types[number]> extends never ? Types : never
  ): Types => types
}

export const CLIENT_MESSAGE_TYPES = defineMessageTypes<ClientToServerMessage>()(
  [
    "room:join",
    "room:request_state",
    "room:ping",
    "group:grab",
    "group:move",
    "group:drop",
    "group:release",
    "groups:arrange",
    "room:lock-toggle",
    "cursor:move",
    "cursor:hide",
    "session:pause",
    "session:resume",
    "room:preview:open",
    "room:preview:close",
    "chat:send",
  ]
)

export const SERVER_MESSAGE_TYPES = defineMessageTypes<ServerToClientMessage>()(
  [
    "room:state",
    "player:joined",
    "player:updated",
    "player:left",
    "cursor:moved",
    "cursor:hidden",
    "session:paused",
    "session:resumed",
    "group:locked",
    "group:unlocked",
    "room:lock-updated",
    "room:lock-rejected",
    "group:moved",
    "groups:merged",
    "pieces:placed",
    "groups:arranged",
    "stats:updated",
    "room:pinged",
    "chat:message",
    "error",
  ]
)

export const WS_MESSAGE_TYPES = [
  ...CLIENT_MESSAGE_TYPES,
  ...SERVER_MESSAGE_TYPES,
] as const satisfies readonly WsMessageType[]
