import type { JigsawRoom, JigsawRoomStats } from "./room-types"

export function getRoomStats(room: JigsawRoom): JigsawRoomStats {
  return {
    totalPieces: Object.keys(room.state.pieces).length,
    placedPieces: Object.values(room.state.pieces).filter(
      (piece) => piece.placed
    ).length,
    groupsCount: Object.keys(room.state.groups).length,
    playersCount: room.players.size,
    snapCount: room.state.snapCount,
  }
}
