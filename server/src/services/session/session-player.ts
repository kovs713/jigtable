import type { Player as JigsawPlayer } from "@jigtable/core/protocol"

import { createPlayerId } from "./session-ids"

const DEFAULT_PLAYER_NAME = "Player"
const PLAYER_NAME_MAX_LENGTH = 24

export function normalizePlayer(value: Record<string, unknown>): JigsawPlayer {
  const id = readNonEmptyString(value.id) ?? createPlayerId()
  const name = normalizePlayerName(readNonEmptyString(value.name))
  const color =
    normalizeColor(readNonEmptyString(value.color)) ?? colorFromSeed(id)

  return { id, name, color }
}

export function createSessionPlayer(input: {
  name?: string
  color?: string
}): JigsawPlayer {
  const id = createPlayerId()

  return normalizePlayer({
    id,
    name: input.name,
    color: input.color ?? colorFromSeed(id),
  })
}

export function normalizePlayerName(value: string | null): string {
  const trimmed = value?.trim().replace(/\s+/g, " ") ?? ""

  if (!trimmed) {
    return `${DEFAULT_PLAYER_NAME} ${Math.floor(Math.random() * 10_000)}`
  }

  return trimmed.slice(0, PLAYER_NAME_MAX_LENGTH)
}

export function normalizeColor(value: string | null): string | null {
  if (!value) {
    return null
  }

  const normalized = value.trim().toLowerCase()

  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : null
}

export function colorFromSeed(seed: string): string {
  let hash = 0

  for (let index = 0; index < seed.length; index++) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  }

  return hslToHex((hash % 360) / 360, 0.72, 0.58)
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const x = chroma * (1 - Math.abs(((hue * 6) % 2) - 1))
  const match = lightness - chroma / 2
  const sector = Math.floor(hue * 6)

  const [red, green, blue] =
    sector === 0
      ? [chroma, x, 0]
      : sector === 1
        ? [x, chroma, 0]
        : sector === 2
          ? [0, chroma, x]
          : sector === 3
            ? [0, x, chroma]
            : sector === 4
              ? [x, 0, chroma]
              : [chroma, 0, x]

  return `#${toHex(red + match)}${toHex(green + match)}${toHex(blue + match)}`
}

function toHex(value: number): string {
  return Math.round(value * 255)
    .toString(16)
    .padStart(2, "0")
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}
