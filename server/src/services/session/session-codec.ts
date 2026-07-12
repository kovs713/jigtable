import { isRecord } from "@jigtable/shared/utils"

import { normalizePlayer } from "./session-player"
import type { JigsawSession, StoredJigsawSession } from "./session-types"

export function toSessionResponse(session: JigsawSession): JigsawSession {
  return {
    token: session.token,
    player: session.player,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  }
}

export function parseStoredSession(
  fallbackToken: string,
  value: Record<string, unknown>
): StoredJigsawSession | null {
  const player = isRecord(value.player) ? normalizePlayer(value.player) : null

  if (!player) {
    return null
  }

  return {
    token: normalizeToken(value.token) ?? fallbackToken,
    player,
    userId: readNonEmptyString(value.userId) ?? undefined,
    createdAt: readTimestamp(value.createdAt),
    updatedAt: readTimestamp(value.updatedAt),
  }
}

export function normalizeToken(value: unknown): string | null {
  return readNonEmptyString(value)?.trim() ?? null
}

export function readTimestamp(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : Date.now()
}

export function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}
