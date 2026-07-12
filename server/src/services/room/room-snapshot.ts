import type {
  GroupId,
  GroupState,
  JigsawState,
  PieceId,
  PieceState,
} from "@jigtable/core/types"

import { getRoomStats } from "./room-stats"
import type { JigsawLock, JigsawRoom, JigsawRoomSnapshot } from "./room-types"

export function toSnapshot(room: JigsawRoom): JigsawRoomSnapshot {
  const toggleLocks: JigsawLock[] = [...room.toggleLocks.values()]

  return {
    roomId: room.roomId,
    jigsaw: {
      assetId: room.assetId,
      imageUrl: room.imageUrl,
      config: room.state.config,
    },
    pieces: room.state.pieces,
    groups: room.state.groups,
    players: [...room.players.values()],
    locks: toggleLocks,
    cursors: [...room.cursors.values()],
    timer: room.timer,
    stats: getRoomStats(room),
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
  }
}

export function pickPieces(
  state: JigsawState,
  pieceIds: PieceId[]
): Record<PieceId, PieceState> {
  const pieces: Record<PieceId, PieceState> = {}

  for (const pieceId of pieceIds) {
    const piece = state.pieces[pieceId]

    if (piece) {
      pieces[pieceId] = piece
    }
  }

  return pieces
}

export function pickGroupsForPieces(
  state: JigsawState,
  pieceIds: PieceId[]
): Record<GroupId, GroupState> {
  const groups: Record<GroupId, GroupState> = {}

  for (const pieceId of pieceIds) {
    const groupId = state.pieces[pieceId]?.groupId

    if (!groupId) {
      continue
    }

    const group = state.groups[groupId]

    if (group) {
      groups[groupId] = group
    }
  }

  return groups
}

export function getGroupAnchorPosition(
  state: JigsawState,
  groupId: GroupId
): { x: number; y: number } | null {
  const group = state.groups[groupId]
  const pieceId = group?.pieceIds[0]
  const piece = pieceId ? state.pieces[pieceId] : null

  return piece ? { x: piece.x, y: piece.y } : null
}
