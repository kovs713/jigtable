import { eq } from "drizzle-orm"

import { db as defaultDb } from "@/db"
import {
  parseStoredPlayerSession,
  toStoredPlayerSessionValue,
} from "@/db/mappers/player-session-mapper"
import { jigsawSessionsSchema } from "@/db/schemas"
import type { RedisCache } from "@/services/redis"
import { playerSessionStorageKey } from "@/services/player-session/player-session-token"
import type { StoredPlayerSession } from "@/services/player-session/player-session.types"

type Database = typeof defaultDb

export interface PlayerSessionRepository {
  findByToken(token: string): Promise<StoredPlayerSession | null>

  save(session: StoredPlayerSession): Promise<void>
}

export class DrizzlePlayerSessionRepository implements PlayerSessionRepository {
  constructor(
    private readonly cache: Pick<RedisCache, "get" | "set" | "delete">,
    private readonly db: Database = defaultDb
  ) {}

  async findByToken(token: string): Promise<StoredPlayerSession | null> {
    const cached = await this.readCached(token)

    if (cached) {
      return cached
    }

    const [row] = await this.db
      .select({
        value: jigsawSessionsSchema.value,
        updatedAt: jigsawSessionsSchema.updatedAt,
      })
      .from(jigsawSessionsSchema)
      .where(eq(jigsawSessionsSchema.key, playerSessionStorageKey(token)))
      .limit(1)

    if (!row) {
      return null
    }

    const session = parseStoredPlayerSession({
      fallbackToken: token,
      fallbackTimestamp: row.updatedAt.getTime(),
      value: row.value,
    })

    if (session) {
      await this.cache.set(session.token, JSON.stringify(session))
    }

    return session
  }

  async save(session: StoredPlayerSession): Promise<void> {
    const updatedAt = new Date(session.updatedAt)

    await this.db
      .insert(jigsawSessionsSchema)
      .values({
        key: playerSessionStorageKey(session.token),
        value: toStoredPlayerSessionValue(session),
        updatedAt,
      })
      .onConflictDoUpdate({
        target: jigsawSessionsSchema.key,
        set: {
          value: toStoredPlayerSessionValue(session),
          updatedAt,
        },
      })

    await this.cache.set(session.token, JSON.stringify(session))
  }

  private async readCached(token: string): Promise<StoredPlayerSession | null> {
    const cached = await this.cache.get(token)

    if (!cached) {
      return null
    }

    try {
      const session = parseStoredPlayerSession({
        fallbackToken: token,
        fallbackTimestamp: Date.now(),
        value: JSON.parse(cached),
      })

      if (session) {
        return session
      }
    } catch {
      // Invalid cache values fall through to PostgreSQL.
    }

    await this.cache.delete(token)

    return null
  }
}
