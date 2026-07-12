import type { GroupId, JigsawState } from "@jigtable/core"
import type {
  JigsawGroupLock,
  JigsawLock,
  JigsawPlayer,
  JigsawPlayerCursor,
  JigsawRoomSnapshot,
  JigsawRoomStats,
  JigsawRoomTimer,
} from "@jigtable/core/protocol"

import type { WsSocket } from "@/api/ws/types"
import type { JigsawSafeAssetRef } from "../../../services/jigsaw-history/history-typesry/history-types"

export type JigsawSocket = WsSocket

export type CreateJigsawRoomInput = {
  assetId?: string
  assetRef: JigsawSafeAssetRef
  imageUrl: string
  sourceSize: {
    width: number
    height: number
  }
  pieceCount: number
}

export type JigsawRoom = {
  roomId: string
  assetId: string
  assetRef: JigsawSafeAssetRef
  imageUrl: string
  state: JigsawState
  players: Map<string, JigsawPlayer>
  cursors: Map<string, JigsawPlayerCursor>
  sockets: Set<JigsawSocket>
  locks: Map<GroupId, JigsawGroupLock>
  toggleLocks: Map<string, JigsawLock>
  pingCooldowns: Map<string, number>
  timer: JigsawRoomTimer
  completedAt?: number
  createdAt: number
  updatedAt: number
}

export type {
  JigsawGroupLock,
  JigsawLock,
  JigsawPlayerCursor,
  JigsawRoomSnapshot,
  JigsawRoomStats,
  JigsawRoomTimer,
}
