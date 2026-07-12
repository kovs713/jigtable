import { eq } from "drizzle-orm"

import { isRecord } from "@jigtable/shared/utils"

import { db } from "@/db"
import { jigsawSessionsSchema } from "@/db/schemas"
import { normalizeToken, parseStoredSession } from "./session-codec"
import { createSessionId, sessionKey } from "./session-ids"
import { createSessionPlayer, normalizePlayer } from "./session-player"
import type {
  RestoreSessionInput,
  StoredJigsawSession,
  UpdateSessionInput,
} from "./session-types"

export class SessionService {
  private readonly sessions = new Map<string, StoredJigsawSession>()

  async restoreSession(
    input: RestoreSessionInput = {}
  ): Promise<StoredJigsawSession> {
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

  async getSession(token: string): Promise<StoredJigsawSession | null> {
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
  ): Promise<StoredJigsawSession | null> {
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
    } satisfies StoredJigsawSession

    await this.writeSession(session)
    this.sessions.set(session.token, session)

    return session
  }

  async linkSessionToUser(
    token: string,
    userId: string
  ): Promise<StoredJigsawSession | null> {
    const current = await this.getSession(token)

    if (!current) {
      return null
    }

    const session = {
      ...current,
      userId,
      updatedAt: Date.now(),
    } satisfies StoredJigsawSession

    await this.writeSession(session)
    this.sessions.set(session.token, session)

    return session
  }

  private async createSession(
    input: RestoreSessionInput
  ): Promise<StoredJigsawSession> {
    const now = Date.now()
    const session = {
      token: createSessionId(),
      player: createSessionPlayer({
        name: input.name,
        color: input.color,
      }),
      createdAt: now,
      updatedAt: now,
    } satisfies StoredJigsawSession

    await this.writeSession(session)
    this.sessions.set(session.token, session)

    return session
  }

  private async readSession(
    token: string
  ): Promise<StoredJigsawSession | null> {
    const result = await db
      .select()
      .from(jigsawSessionsSchema)
      .where(eq(jigsawSessionsSchema.key, sessionKey(token)))
      .limit(1)
    const value = result[0]?.value

    if (!isRecord(value)) {
      return null
    }

    return parseStoredSession(token, value)
  }

  private async writeSession(session: StoredJigsawSession): Promise<void> {
    await db
      .insert(jigsawSessionsSchema)
      .values({
        key: sessionKey(session.token),
        value: session,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: jigsawSessionsSchema.key,
        set: {
          value: session,
          updatedAt: new Date(),
        },
      })
  }
}
