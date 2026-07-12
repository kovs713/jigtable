import type { JigsawRoomTimer } from "./room-types"

export function getTimerElapsedMs(
  timer: JigsawRoomTimer,
  now = Date.now()
): number {
  if (timer.paused) {
    return timer.elapsedMs
  }

  return timer.elapsedMs + Math.max(0, now - timer.updatedAt)
}
