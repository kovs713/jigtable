import { eq } from "drizzle-orm"

import { db as defaultDb } from "@/db"
import { jigsawSessionsSchema } from "@/db/schemas"
import {
  parseStoredPlayerSession,
  toStoredPlayerSessionValue,
} from "@/db/mappers/player-session-mapper"
import type { PlayerSessionRepository } from "@/services/player-session/contracts"
import { playerSessionStorageKey } from "@/services/player-session/player-session-token"
import type { StoredPlayerSession } from "@/services/player-session/player-session-types"

type Database = typeof defaultDb

export class DrizzlePlayerSessionRepository implements PlayerSessionRepository {
  private readonly cache = new Map<string, StoredPlayerSession>()

  constructor(private readonly db: Database = defaultDb) {}

  async findByToken(token: string): Promise<StoredPlayerSession | null> {
    const cached = this.cache.get(token)

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
      this.cache.set(session.token, session)
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

    this.cache.set(session.token, session)
  }
}
