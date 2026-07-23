import type {
  Player as JigsawPlayer,
  PlayerSession as JigsawSession,
} from "@jigtable/core/protocol"
import { apiRoutes } from "@jigtable/shared/api-routes"
import { isRecord } from "@jigtable/shared/utils"

import { API_BASE_URL } from "@/config"
import { readApiError } from "@/lib/api-response"

const LOCAL_SESSION_STORAGE_KEY = "jigsaw-room-session"
const LEGACY_PLAYER_STORAGE_KEY = "jigsaw-room-player"
const PLAYER_NAME_MAX_LENGTH = 24

export function readLocalJigsawSession(): JigsawSession {
  const saved = readSavedSession()

  if (saved) {
    return saved
  }

  const legacyPlayer = readLegacyPlayer()
  const session = createLocalJigsawSession(legacyPlayer ?? undefined)

  saveLocalJigsawSession(session)

  return session
}

export async function restoreJigsawSession(
  fallback: JigsawSession,
  roomId?: string
): Promise<JigsawSession> {
  const response = await fetch(
    `${API_BASE_URL}${apiRoutes.sessions.post.pattern}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: fallback.token,
        player: fallback.player,
        roomId,
      }),
    }
  )
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      readApiError(payload) ?? `Session failed: ${response.status}`
    )
  }

  const session = parseSession(payload)

  if (!session) {
    throw new Error("Invalid jigsaw session")
  }

  return session
}

export async function saveJigsawSessionProfile(
  sessionToken: string,
  profile: Pick<JigsawPlayer, "name" | "color">
): Promise<JigsawSession> {
  const response = await fetch(
    `${API_BASE_URL}${apiRoutes.sessions.patch.current.pattern}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ player: profile }),
    }
  )
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(readApiError(payload) ?? `Save failed: ${response.status}`)
  }

  const session = parseSession(payload)

  if (!session) {
    throw new Error("Invalid jigsaw session")
  }

  return session
}

export function saveLocalJigsawSession(session: JigsawSession): void {
  localStorage.setItem(LOCAL_SESSION_STORAGE_KEY, JSON.stringify(session))
  localStorage.removeItem(LEGACY_PLAYER_STORAGE_KEY)
}

export function createLocalJigsawSession(
  player?: Partial<JigsawPlayer>
): JigsawSession {
  const now = Date.now()
  const id = player?.id ?? createId("player")
  const suffix = id
    .replace(/[^a-z0-9]/gi, "")
    .slice(-4)
    .toUpperCase()
  const normalizedPlayer = normalizePlayer({
    id,
    name: player?.name ?? `Player ${suffix}`,
    color: player?.color ?? colorFromSeed(id),
  })

  return {
    token: createId("session"),
    player: normalizedPlayer,
    createdAt: now,
    updatedAt: now,
  }
}

function readSavedSession(): JigsawSession | null {
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_STORAGE_KEY)
    const value = raw ? JSON.parse(raw) : null
    const session = parseSession(value)

    if (session) {
      return session
    }
  } catch {
    return null
  }

  return null
}

function readLegacyPlayer(): JigsawPlayer | null {
  try {
    const raw = localStorage.getItem(LEGACY_PLAYER_STORAGE_KEY)
    const value = raw ? JSON.parse(raw) : null

    return parsePlayer(value)
  } catch {
    return null
  }
}

function parseSession(value: unknown): JigsawSession | null {
  if (!isRecord(value) || typeof value.token !== "string") {
    return null
  }

  const player = parsePlayer(value.player)

  if (!player) {
    return null
  }

  return {
    token: value.token,
    player,
    createdAt: readTimestamp(value.createdAt),
    updatedAt: readTimestamp(value.updatedAt),
  }
}

function parsePlayer(value: unknown): JigsawPlayer | null {
  if (!isRecord(value) || typeof value.id !== "string") {
    return null
  }

  return normalizePlayer({
    id: value.id,
    name: typeof value.name === "string" ? value.name : undefined,
    color: typeof value.color === "string" ? value.color : undefined,
  })
}

function normalizePlayer(player: {
  id: string
  name?: string
  color?: string
}): JigsawPlayer {
  const name = player.name
    ?.trim()
    .replace(/\s+/g, " ")
    .slice(0, PLAYER_NAME_MAX_LENGTH)
  const color = normalizeColor(player.color) ?? colorFromSeed(player.id)

  return {
    id: player.id,
    name: name || "Player",
    color,
  }
}

function normalizeColor(value: string | undefined): string | null {
  const color = value?.trim().toLowerCase()

  return color && /^#[0-9a-f]{6}$/.test(color) ? color : null
}

function colorFromSeed(seed: string): string {
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

function readTimestamp(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : Date.now()
}

function createId(prefix: string): string {
  const random = crypto.randomUUID?.() ?? String(Math.random()).slice(2)

  return `${prefix}_${random.replace(/-/g, "")}`
}
