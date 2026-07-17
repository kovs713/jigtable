import { getRoomStats } from "./room-stats"
import { getTimerElapsedMs } from "./room-timer"
import type { Room } from "./room-types"

export type CompletedRoomRecord = {
  completedAt: number
  elapsedMs: number
  pieceCount: number
  snapCount: number
}

export function completeRoomIfSolved(
  room: Room,
  now = Date.now()
): CompletedRoomRecord | null {
  if (room.completedAt !== undefined) {
    return null
  }

  const stats = getRoomStats(room)

  if (stats.placedPieces < stats.totalPieces) {
    return null
  }

  room.completedAt = now

  if (!room.timer.paused) {
    room.timer.elapsedMs = getTimerElapsedMs(room.timer, now)
    room.timer.updatedAt = now
    room.timer.paused = true
  }

  return {
    completedAt: now,
    elapsedMs: getTimerElapsedMs(room.timer, now),
    pieceCount: stats.totalPieces,
    snapCount: stats.snapCount,
  }
}
