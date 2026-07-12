import { getRoomStats } from "./room-stats"
import { getTimerElapsedMs } from "./room-timer"
import type { JigsawRoom } from "./room-types"

export type CompletedRoomRecord = {
  completedAt: number
  elapsedMs: number
  pieceCount: number
  snapCount: number
}

export function markRoomCompletedIfSolved(
  room: JigsawRoom
): CompletedRoomRecord | null {
  if (room.completedAt) {
    return null
  }

  const stats = getRoomStats(room)

  if (stats.placedPieces < stats.totalPieces) {
    return null
  }

  const completedAt = Date.now()

  room.completedAt = completedAt

  if (!room.timer.paused) {
    room.timer.elapsedMs = getTimerElapsedMs(room.timer, completedAt)
    room.timer.updatedAt = completedAt
    room.timer.paused = true
  }

  return {
    completedAt,
    elapsedMs: getTimerElapsedMs(room.timer, completedAt),
    pieceCount: stats.totalPieces,
    snapCount: stats.snapCount,
  }
}
