import type { ServerToClientMessage } from "@jigtable/core/protocol"

export type LockTargetType = "piece" | "group"

export type LockedBy = {
  userId: string
  name: string
  color: string
}

export type RoomEvent = Exclude<ServerToClientMessage, { type: "error" }>

export type RoomErrorCode =
  | "not_joined"
  | "session_required"
  | "room_not_found"
  | "session_paused"
  | "group_unavailable"
  | "group_locked"
  | "lock_required"

export interface RoomPublisher {
  send(connectionId: string, event: RoomEvent): void

  broadcast(roomId: string, event: RoomEvent): void

  broadcastExcept(roomId: string, connectionId: string, event: RoomEvent): void

  error(connectionId: string, code: RoomErrorCode, message: string): void
}
