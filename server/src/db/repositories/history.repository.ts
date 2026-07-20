import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm"

import type { PersistedRoomEvent } from "@jigtable/core/session-history"

import { db as defaultDb } from "@/db"
import {
  toHistoryEntry,
  toRoomResult,
  toStoredAssetReference,
} from "@/db/mappers"
import {
  roomParticipantsSchema,
  roomEventsSchema,
  roomResultsSchema,
  userXpTransactionsSchema,
  usersSchema,
} from "@/db/schemas"
import type {
  HistoryEntry,
  ResultParticipant,
  RoomCompletion,
  RoomResult,
  UpdateParticipantProfileInput,
  UpsertParticipantInput,
} from "@/services/history"
import {
  CONTRIBUTION_VERSION,
  finalizeSession,
  SCORING_VERSION,
} from "@/services/history/session-finalizer"

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

  listPendingCompletions(): Promise<RoomCompletion[]>

  listUserHistory(userId: string): Promise<HistoryEntry[]>

  findRoomResult(roomId: string): Promise<RoomResult | null>

  findUserColors(userIds: readonly string[]): Promise<Map<string, string>>
}

export class DrizzleHistoryRepository implements HistoryRepository {
  constructor(private readonly db: Database = defaultDb) {}

  async upsertParticipant(input: UpsertParticipantInput): Promise<void> {
    const values = {
      anonSessionHash: input.sessionHash,
      userId: input.userId,
      name: input.name,
      color: input.color,
      lastSeenAt: input.seenAt,
      leftAt: null,
    }

    await this.db
      .insert(roomParticipantsSchema)
      .values({
        roomId: input.roomId,
        playerId: input.playerId,
        ...values,
        joinedAt: input.seenAt,
      })
      .onConflictDoUpdate({
        target: [
          roomParticipantsSchema.roomId,
          roomParticipantsSchema.playerId,
        ],
        set: values,
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
      .update(roomParticipantsSchema)
      .set({
        leftAt,
        lastSeenAt: leftAt,
      })
      .where(
        and(
          eq(roomParticipantsSchema.roomId, roomId),
          eq(roomParticipantsSchema.playerId, playerId)
        )
      )
  }

  async updateParticipantProfile(
    input: UpdateParticipantProfileInput
  ): Promise<void> {
    await this.db
      .update(roomParticipantsSchema)
      .set({
        userId: input.userId,
        name: input.name,
        color: input.color,
        lastSeenAt: input.seenAt,
      })
      .where(eq(roomParticipantsSchema.anonSessionHash, input.sessionHash))
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
      .update(roomParticipantsSchema)
      .set({
        userId,
        lastSeenAt: linkedAt,
      })
      .where(eq(roomParticipantsSchema.anonSessionHash, sessionHash))
  }

  async saveCompletion(completion: RoomCompletion): Promise<void> {
    await this.db.transaction(async (tx) => {
      const participantRows = await tx
        .select()
        .from(roomParticipantsSchema)
        .where(eq(roomParticipantsSchema.roomId, completion.roomId))
      const userIds = [
        ...new Set(
          participantRows.flatMap((participant) =>
            participant.userId ? [participant.userId] : []
          )
        ),
      ]
      const linkedUsers =
        userIds.length > 0
          ? await tx
              .select({
                id: usersSchema.id,
                telegramId: usersSchema.telegramId,
              })
              .from(usersSchema)
              .where(inArray(usersSchema.id, userIds))
          : []
      const usersById = new Map(linkedUsers.map((user) => [user.id, user]))
      const participants: ResultParticipant[] = participantRows.map(
        (participant) => ({
          playerId: participant.playerId,
          userId: participant.userId,
          telegramId: participant.userId
            ? usersById.get(participant.userId)?.telegramId
            : undefined,
          name: participant.name,
          color: participant.color,
        })
      )

      await tx
        .insert(roomResultsSchema)
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
        .onConflictDoNothing({ target: roomResultsSchema.roomId })

      const [result] = await tx
        .select({ summary: roomResultsSchema.summary })
        .from(roomResultsSchema)
        .where(eq(roomResultsSchema.roomId, completion.roomId))
        .for("update")
        .limit(1)

      if (!result || result.summary) return

      const eventRows = await tx
        .select()
        .from(roomEventsSchema)
        .where(eq(roomEventsSchema.roomId, completion.roomId))
        .orderBy(roomEventsSchema.sequence)
      const completionSequence = eventRows.findLast(
        (event) => event.eventType === "room_completed"
      )?.sequence
      if (completionSequence === undefined) {
        throw new Error("Room completion event is not committed")
      }
      const events = eventRows
        .filter((event) => event.sequence <= completionSequence)
        .map(
          (event) =>
            ({
              ...event,
              createdAt: event.createdAt.toISOString(),
            }) as PersistedRoomEvent
        )
      const summary = finalizeSession({ completion, participants, events })
      const xpByUser = new Map<string, number>()

      for (const player of summary.players) {
        if (player.userId && player.xpGained > 0) {
          xpByUser.set(
            player.userId,
            (xpByUser.get(player.userId) ?? 0) + player.xpGained
          )
        }
      }

      for (const [userId, amount] of xpByUser) {
        const awarded = await tx
          .insert(userXpTransactionsSchema)
          .values({
            userId,
            roomId: completion.roomId,
            reason: "room_completion",
            amount,
            scoringVersion: SCORING_VERSION,
            createdAt: completion.completedAt,
          })
          .onConflictDoNothing({
            target: [
              userXpTransactionsSchema.userId,
              userXpTransactionsSchema.roomId,
              userXpTransactionsSchema.reason,
            ],
          })
          .returning({ id: userXpTransactionsSchema.id })

        if (awarded.length > 0) {
          await tx
            .update(usersSchema)
            .set({
              xpTotal: sql`${usersSchema.xpTotal} + ${amount}`,
              xpUpdatedAt: sql`GREATEST(COALESCE(${usersSchema.xpUpdatedAt}, ${completion.completedAt}), ${completion.completedAt})`,
            })
            .where(eq(usersSchema.id, userId))
        }
      }

      await tx
        .update(roomResultsSchema)
        .set({
          summary,
          scoringVersion: SCORING_VERSION,
          contributionVersion: CONTRIBUTION_VERSION,
          finalizedAt: completion.completedAt,
        })
        .where(eq(roomResultsSchema.roomId, completion.roomId))
    })
  }

  async listPendingCompletions(): Promise<RoomCompletion[]> {
    const rows = await this.db
      .select({ event: roomEventsSchema })
      .from(roomEventsSchema)
      .leftJoin(
        roomResultsSchema,
        eq(roomResultsSchema.roomId, roomEventsSchema.roomId)
      )
      .where(
        and(
          eq(roomEventsSchema.eventType, "room_completed"),
          isNull(roomResultsSchema.summary)
        )
      )
      .orderBy(roomEventsSchema.sequence)
    const byRoom = new Map<string, RoomCompletion>()

    for (const { event } of rows) {
      if (event.eventType !== "room_completed") continue
      const payload = event.payload as Extract<
        PersistedRoomEvent,
        { eventType: "room_completed" }
      >["payload"]

      byRoom.set(event.roomId, {
        roomId: event.roomId,
        assetRef: payload.assetRef,
        config: payload.jigsawConfig,
        imageUrl: payload.imageUrl,
        elapsedMs: payload.elapsedMs,
        pieceCount: payload.pieceCount,
        snapCount: payload.snapCount,
        completedAt: new Date(payload.completedAt),
      })
    }

    return [...byRoom.values()]
  }

  async listUserHistory(userId: string): Promise<HistoryEntry[]> {
    const participantRows = await this.db
      .select({
        roomId: roomParticipantsSchema.roomId,
      })
      .from(roomParticipantsSchema)
      .where(eq(roomParticipantsSchema.userId, userId))

    const roomIds = [...new Set(participantRows.map((row) => row.roomId))]

    if (roomIds.length === 0) {
      return []
    }

    const rows = await this.db
      .select()
      .from(roomResultsSchema)
      .where(inArray(roomResultsSchema.roomId, roomIds))
      .orderBy(desc(roomResultsSchema.completedAt))

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
      .from(roomResultsSchema)
      .where(eq(roomResultsSchema.roomId, roomId))
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
      summary: row.summary,
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
}
