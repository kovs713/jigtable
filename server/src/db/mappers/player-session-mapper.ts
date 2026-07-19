import { isRecord } from "@jigtable/shared/utils"

import {
  normalizePlayerColor,
  normalizePlayerName,
} from "@/services/player-session/player-profile"
import { normalizePlayerSessionToken } from "@/services/player-session/player-session-token"
import type { StoredPlayerSession } from "@/services/player-session/player-session.types"

export function parseStoredPlayerSession({
  fallbackToken,
  fallbackTimestamp,
  value,
}: {
  fallbackToken: string
  fallbackTimestamp: number
  value: unknown
}): StoredPlayerSession | null {
  if (!isRecord(value) || !isRecord(value.player)) {
    return null
  }

  const token = normalizePlayerSessionToken(fallbackToken)
  const playerId = readNonEmptyString(value.player.id)
  const playerName = normalizePlayerName(value.player.name)
  const playerColor = normalizePlayerColor(value.player.color)

  if (!token || !playerId || !playerName || !playerColor) {
    return null
  }

  const createdAt = readTimestamp(value.createdAt) ?? fallbackTimestamp
  const updatedAt = readTimestamp(value.updatedAt) ?? fallbackTimestamp
  const userId = readNonEmptyString(value.userId)

  return {
    token,
    player: {
      id: playerId,
      name: playerName,
      color: playerColor,
    },
    userId: userId ?? undefined,
    createdAt,
    updatedAt,
  }
}

export function toStoredPlayerSessionValue(
  session: StoredPlayerSession
): StoredPlayerSession {
  return session
}

function readTimestamp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}
