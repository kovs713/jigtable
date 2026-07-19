import type { Player, Room, RoomTimer } from "./room.types"

export function getTimerElapsedMs(timer: RoomTimer, now = Date.now()): number {
  if (timer.paused) {
    return timer.elapsedMs
  }

  return timer.elapsedMs + Math.max(0, now - timer.updatedAt)
}

export function pauseRoom(
  room: Room,
  player: Player,
  now = Date.now()
): RoomTimer | null {
  if (room.timer.paused) {
    return null
  }

  room.timer = {
    elapsedMs: getTimerElapsedMs(room.timer, now),
    paused: true,
    updatedAt: now,
    pausedByPlayerId: player.id,
    pausedByPlayerName: player.name,
  }
  room.updatedAt = now

  return room.timer
}

export function resumeRoom(room: Room, now = Date.now()): RoomTimer | null {
  if (!room.timer.paused) {
    return null
  }

  room.timer = {
    elapsedMs: room.timer.elapsedMs,
    paused: false,
    updatedAt: now,
  }
  room.updatedAt = now

  return room.timer
}
