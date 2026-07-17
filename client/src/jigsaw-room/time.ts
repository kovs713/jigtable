import type { RoomTimer as JigsawRoomTimer } from "@jigtable/core/protocol"

export function createInitialTimer(): JigsawRoomTimer {
  return {
    elapsedMs: 0,
    paused: false,
    updatedAt: Date.now(),
  }
}

export function getTimerElapsedMs(
  timer: JigsawRoomTimer,
  now = Date.now()
): number {
  if (timer.paused) {
    return timer.elapsedMs
  }

  return timer.elapsedMs + Math.max(0, now - timer.updatedAt)
}

export function formatElapsedTime(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${padTime(minutes)}:${padTime(seconds)}`
  }

  return `${minutes}:${padTime(seconds)}`
}

export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours) {
    return `${hours}h ${minutes}m`
  }

  if (minutes) {
    return `${minutes}m ${seconds}s`
  }

  return `${seconds}s`
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function padTime(value: number): string {
  return value.toString().padStart(2, "0")
}
