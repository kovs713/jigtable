import { and, desc, eq, inArray } from "drizzle-orm"

import { db as defaultDb } from "@/db"
import {
  toHistoryEntry,
  toRoomResult,
  toStoredAssetReference,
} from "@/db/mappers/history-result-mapper"
import {
  jigsawRoomParticipantsSchema,
  jigsawRoomResultsSchema,
  usersSchema,
} from "@/db/schemas"
import type {
  UpdateParticipantProfileInput,
  UpsertParticipantInput,
} from "@/services/history/contracts"
import type {
  HistoryEntry,
  ResultParticipant,
  RoomCompletion,
  RoomResult,
} from "@/services/history/types"

type Database = typeof defaultDb

export type HistoryRepository = {
  upsertParticipant(input: UpsertParticipantInput): Promise<void>

  markParticipantLeft(input: {
    roomId: string
    playerId: string
    leftAt: Date
  }): Promise<void>

  updateParticipantProfile(input: UpdateParticipantProfileInput): Promise<void>

  linkSessionToUser(input: {
    sessionHash: string
    userId: string
    linkedAt: Date
  }): Promise<void>

  saveCompletion(completion: RoomCompletion): Promise<void>

  listUserHistory(userId: string): Promise<HistoryEntry[]>

  findRoomResult(roomId: string): Promise<RoomResult | null>

  findUserColors(userIds: readonly string[]): Promise<Map<string, string>>
}

export class DrizzleHistoryRepository implements HistoryRepository {
  constructor(private readonly db: Database = defaultDb) {}

  async upsertParticipant(input: UpsertParticipantInput): Promise<void> {
    const [existing] = await this.db
      .select({
        id: jigsawRoomParticipantsSchema.id,
      })
      .from(jigsawRoomParticipantsSchema)
      .where(
        and(
          eq(jigsawRoomParticipantsSchema.roomId, input.roomId),
          eq(jigsawRoomParticipantsSchema.playerId, input.playerId)
        )
      )
      .limit(1)

    const values = {
      anonSessionHash: input.sessionHash,
      userId: input.userId,
      name: input.name,
      color: input.color,
      lastSeenAt: input.seenAt,
      leftAt: null,
    }

    if (existing) {
      await this.db
        .update(jigsawRoomParticipantsSchema)
        .set(values)
        .where(eq(jigsawRoomParticipantsSchema.id, existing.id))

      return
    }

    await this.db.insert(jigsawRoomParticipantsSchema).values({
      roomId: input.roomId,
      playerId: input.playerId,
      ...values,
      joinedAt: input.seenAt,
    })
  }

  async markParticipantLeft({
    roomId,
    playerId,
    leftAt,
  }: {
    roomId: string
    playerId: string
    leftAt: Date
  }): Promise<void> {
    await this.db
      .update(jigsawRoomParticipantsSchema)
      .set({
        leftAt,
        lastSeenAt: leftAt,
      })
      .where(
        and(
          eq(jigsawRoomParticipantsSchema.roomId, roomId),
          eq(jigsawRoomParticipantsSchema.playerId, playerId)
        )
      )
  }

  async updateParticipantProfile(
    input: UpdateParticipantProfileInput
  ): Promise<void> {
    await this.db
      .update(jigsawRoomParticipantsSchema)
      .set({
        userId: input.userId,
        name: input.name,
        color: input.color,
        lastSeenAt: input.seenAt,
      })
      .where(
        eq(jigsawRoomParticipantsSchema.anonSessionHash, input.sessionHash)
      )
  }

  async linkSessionToUser({
    sessionHash,
    userId,
    linkedAt,
  }: {
    sessionHash: string
    userId: string
    linkedAt: Date
  }): Promise<void> {
    await this.db
      .update(jigsawRoomParticipantsSchema)
      .set({
        userId,
        lastSeenAt: linkedAt,
      })
      .where(eq(jigsawRoomParticipantsSchema.anonSessionHash, sessionHash))
  }

  async saveCompletion(completion: RoomCompletion): Promise<void> {
    const participants = await this.readResultParticipants(completion.roomId)

    await this.db
      .insert(jigsawRoomResultsSchema)
      .values({
        roomId: completion.roomId,
        assetRef: toStoredAssetReference(completion.assetRef),
        jigsawConfig: completion.config,
        imageUrl: completion.imageUrl,
        participants,
        elapsedMs: completion.elapsedMs,
        pieceCount: completion.pieceCount,
        snapCount: completion.snapCount,
        completedAt: completion.completedAt,
      })
      .onConflictDoNothing({
        target: jigsawRoomResultsSchema.roomId,
      })
  }

  async listUserHistory(userId: string): Promise<HistoryEntry[]> {
    const participantRows = await this.db
      .select({
        roomId: jigsawRoomParticipantsSchema.roomId,
      })
      .from(jigsawRoomParticipantsSchema)
      .where(eq(jigsawRoomParticipantsSchema.userId, userId))

    const roomIds = [...new Set(participantRows.map((row) => row.roomId))]

    if (roomIds.length === 0) {
      return []
    }

    const rows = await this.db
      .select()
      .from(jigsawRoomResultsSchema)
      .where(inArray(jigsawRoomResultsSchema.roomId, roomIds))
      .orderBy(desc(jigsawRoomResultsSchema.completedAt))

    return rows.flatMap((row) => {
      const entry = toHistoryEntry({
        roomId: row.roomId,
        assetRef: row.assetRef,
        imageUrl: row.imageUrl,
        config: row.jigsawConfig,
        elapsedMs: row.elapsedMs,
        pieceCount: row.pieceCount,
        snapCount: row.snapCount,
        completedAt: row.completedAt,
        participants: row.participants,
      })

      return entry ? [entry] : []
    })
  }

  async findRoomResult(roomId: string): Promise<RoomResult | null> {
    const [row] = await this.db
      .select()
      .from(jigsawRoomResultsSchema)
      .where(eq(jigsawRoomResultsSchema.roomId, roomId))
      .limit(1)

    if (!row) {
      return null
    }

    return toRoomResult({
      roomId: row.roomId,
      assetRef: row.assetRef,
      imageUrl: row.imageUrl,
      config: row.jigsawConfig,
      elapsedMs: row.elapsedMs,
      pieceCount: row.pieceCount,
      snapCount: row.snapCount,
      completedAt: row.completedAt,
      participants: row.participants,
    })
  }

  async findUserColors(
    userIds: readonly string[]
  ): Promise<Map<string, string>> {
    if (userIds.length === 0) {
      return new Map()
    }

    const users = await this.db
      .select({
        id: usersSchema.id,
        color: usersSchema.color,
      })
      .from(usersSchema)
      .where(inArray(usersSchema.id, [...userIds]))

    return new Map(users.map((user) => [user.id, user.color]))
  }

  private async readResultParticipants(
    roomId: string
  ): Promise<ResultParticipant[]> {
    const participants = await this.db
      .select()
      .from(jigsawRoomParticipantsSchema)
      .where(eq(jigsawRoomParticipantsSchema.roomId, roomId))

    const userIds = [
      ...new Set(
        participants.flatMap((participant) =>
          participant.userId ? [participant.userId] : []
        )
      ),
    ]

    const users =
      userIds.length > 0
        ? await this.db
            .select({
              id: usersSchema.id,
              telegramId: usersSchema.telegramId,
            })
            .from(usersSchema)
            .where(inArray(usersSchema.id, userIds))
        : []

    const usersById = new Map(users.map((user) => [user.id, user]))

    return participants.map((participant) => {
      const user = participant.userId
        ? usersById.get(participant.userId)
        : undefined

      return {
        userId: participant.userId ?? undefined,
        telegramId: user?.telegramId,
        name: participant.name,
        color: participant.color,
      }
    })
  }
}
