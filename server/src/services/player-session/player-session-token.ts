import { randomBytes, randomUUID } from "node:crypto"

// Persistence compatibility only. Rename through a DB migration later.
const PLAYER_SESSION_KEY_PREFIX = "jigsaw:session:"

export function createPlayerSessionToken(): string {
  return `session_${randomBytes(32).toString("base64url")}`
}

export function createPlayerId(): string {
  return `player_${randomUUID().replaceAll("-", "")}`
}

export function playerSessionStorageKey(token: string): string {
  return `${PLAYER_SESSION_KEY_PREFIX}${token}`
}

export function normalizePlayerSessionToken(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}
