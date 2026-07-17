import type { GroupId, JigsawState as PuzzleState } from "@jigtable/core"
import type {
  JigsawGroupLock as GroupDragLock,
  Player,
  PlayerCursor,
  RoomSnapshot,
  RoomStats,
  RoomTimer,
  JigsawLock as ToggleLock,
} from "@jigtable/core/protocol"

import type { AssetReference } from "@/services/history"

export type CreateRoomInput = {
  assetId?: string
  assetRef: AssetReference
  imageUrl: string
  sourceSize: {
    width: number
    height: number
  }
  pieceCount: number
}

export type RoomConnection = {
  connectionId: string
  sessionToken: string
  playerId: string
}

export type Room = {
  roomId: string
  assetId: string
  assetRef: AssetReference
  imageUrl: string
  state: PuzzleState
  players: Map<string, Player>
  connections: Map<string, RoomConnection>
  cursors: Map<string, PlayerCursor>
  dragLocks: Map<GroupId, GroupDragLock>
  toggleLocks: Map<string, ToggleLock>
  pingCooldowns: Map<string, number>
  timer: RoomTimer
  completedAt?: number
  createdAt: number
  updatedAt: number
}

export type JoinedRoom = {
  room: Room
  player: Player
  connection: RoomConnection
}

export type {
  GroupDragLock,
  Player,
  PlayerCursor,
  RoomSnapshot,
  RoomStats,
  RoomTimer,
  ToggleLock,
}
