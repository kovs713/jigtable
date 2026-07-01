import { eq } from "drizzle-orm"

import type { PuzzlePlayer, PuzzleSession } from "@puzzle-shuffle/puzzle-core"

import { db } from "@/infra/db"
import { puzzleSessionsSchema } from "@/infra/db/shemas"

export interface StoredPuzzleSession extends PuzzleSession {
  userId?: string
}

const SESSION_KEY_PREFIX = "puzzle:session:"
const DEFAULT_PLAYER_NAME = "Player"
const PLAYER_NAME_MAX_LENGTH = 24

interface RestoreSessionInput {
  token?: string
  name?: string
  color?: string
}

interface UpdateSessionInput {
  name?: string
  color?: string
}

export class PuzzleSessionStore {
  private readonly sessions = new Map<string, StoredPuzzleSession>()

  async restoreSession(
    input: RestoreSessionInput = {}
  ): Promise<StoredPuzzleSession> {
    const token = normalizeToken(input.token)

    if (token) {
      const existing =
        this.sessions.get(token) ?? (await this.readSession(token))

      if (existing) {
        this.sessions.set(existing.token, existing)
        return existing
      }
    }

    return this.createSession(input)
  }

  async getSession(token: string): Promise<StoredPuzzleSession | null> {
    const safeToken = normalizeToken(token)

    if (!safeToken) {
      return null
    }

    const cached = this.sessions.get(safeToken)

    if (cached) {
      return cached
    }

    const session = await this.readSession(safeToken)

    if (session) {
      this.sessions.set(session.token, session)
    }

    return session
  }

  async updateSession(
    token: string,
    input: UpdateSessionInput
  ): Promise<StoredPuzzleSession | null> {
    const current = await this.getSession(token)

    if (!current) {
      return null
    }

    const player = normalizePlayer({
      id: current.player.id,
      name: input.name ?? current.player.name,
      color: input.color ?? current.player.color,
    })
    const session = {
      ...current,
      player,
      updatedAt: Date.now(),
    } satisfies StoredPuzzleSession

    await this.writeSession(session)
    this.sessions.set(session.token, session)

    return session
  }

  async linkSessionToUser(
    token: string,
    userId: string
  ): Promise<StoredPuzzleSession | null> {
    const current = await this.getSession(token)

    if (!current) {
      return null
    }

    const session = {
      ...current,
      userId,
      updatedAt: Date.now(),
    } satisfies StoredPuzzleSession

    await this.writeSession(session)
    this.sessions.set(session.token, session)

    return session
  }

  private async createSession(
    input: RestoreSessionInput
  ): Promise<StoredPuzzleSession> {
    const now = Date.now()
    const playerId = createId("player")
    const session = {
      token: createId("session"),
      player: normalizePlayer({
        id: playerId,
        name: input.name,
        color: input.color ?? colorFromSeed(playerId),
      }),
      createdAt: now,
      updatedAt: now,
    } satisfies StoredPuzzleSession

    await this.writeSession(session)
    this.sessions.set(session.token, session)

    return session
  }

  private async readSession(
    token: string
  ): Promise<StoredPuzzleSession | null> {
    const result = await db
      .select()
      .from(puzzleSessionsSchema)
      .where(eq(puzzleSessionsSchema.key, sessionKey(token)))
      .limit(1)
    const value = result[0]?.value

    if (!isRecord(value)) {
      return null
    }

    return parseStoredSession(token, value)
  }

  private async writeSession(session: StoredPuzzleSession): Promise<void> {
    await db
      .insert(puzzleSessionsSchema)
      .values({
        key: sessionKey(session.token),
        value: session,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: puzzleSessionsSchema.key,
        set: { value: session, updatedAt: new Date() },
      })
  }
}

export function toSessionResponse(session: PuzzleSession): PuzzleSession {
  return {
    token: session.token,
    player: session.player,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  }
}

function parseStoredSession(
  fallbackToken: string,
  value: Record<string, unknown>
): StoredPuzzleSession | null {
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

function normalizePlayer(value: Record<string, unknown>): PuzzlePlayer {
  const id = readNonEmptyString(value.id) ?? createId("player")
  const name = normalizePlayerName(readNonEmptyString(value.name))
  const color =
    normalizeColor(readNonEmptyString(value.color)) ?? colorFromSeed(id)

  return { id, name, color }
}

function normalizePlayerName(value: string | null): string {
  const trimmed = value?.trim().replace(/\s+/g, " ") ?? ""

  if (!trimmed) {
    return `${DEFAULT_PLAYER_NAME} ${Math.floor(Math.random() * 10_000)}`
  }

  return trimmed.slice(0, PLAYER_NAME_MAX_LENGTH)
}

function normalizeColor(value: string | null): string | null {
  if (!value) {
    return null
  }

  const normalized = value.trim().toLowerCase()

  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : null
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

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

function normalizeToken(value: unknown): string | null {
  return readNonEmptyString(value)?.trim() ?? null
}

function sessionKey(token: string): string {
  return `${SESSION_KEY_PREFIX}${token}`
}

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
