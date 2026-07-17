import { randomInt } from "node:crypto"

import type { Player } from "@jigtable/core/protocol"
import { colorFromSeed } from "@jigtable/shared/utils"

import { createPlayerId } from "./player-session-token"

const DEFAULT_PLAYER_NAME = "Player"
const PLAYER_NAME_MAX_LENGTH = 24
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/

export function createPlayerProfile(input: {
  name?: string
  color?: string
}): Player {
  const id = createPlayerId()

  return {
    id,
    name: normalizePlayerName(input.name) ?? createDefaultPlayerName(),
    color: normalizePlayerColor(input.color) ?? colorFromSeed(id),
  }
}

export function updatePlayerProfile(
  player: Player,
  input: {
    name?: string
    color?: string
  }
): Player {
  return {
    id: player.id,
    name:
      input.name === undefined
        ? player.name
        : (normalizePlayerName(input.name) ?? player.name),
    color:
      input.color === undefined
        ? player.color
        : (normalizePlayerColor(input.color) ?? player.color),
  }
}

export function normalizePlayerName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim().replace(/\s+/g, " ")

  return normalized ? normalized.slice(0, PLAYER_NAME_MAX_LENGTH) : null
}

export function normalizePlayerColor(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim().toLowerCase()

  return HEX_COLOR_PATTERN.test(normalized) ? normalized : null
}

function createDefaultPlayerName(): string {
  return `${DEFAULT_PLAYER_NAME} ${randomInt(10_000)}`
}
