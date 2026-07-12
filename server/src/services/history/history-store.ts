import { and, desc, eq, inArray } from "drizzle-orm"

import { db } from "@/db"
import {
  jigsawRoomParticipantsSchema,
  jigsawRoomResultsSchema,
  usersSchema,
} from "@/db/schemas"
import { hashToken } from "./asset-ref"
import { toJigsawHistoryItem, toJigsawRoomResult } from "./history-mappers"
import type {
  JigsawHistoryItem,
  JigsawHistoryRoomInfo,
  JigsawResultParticipant,
  JigsawRoomResult,
} from "./history-types"
import type { StoredJigsawSession } from "../session"

export class HistoryService {
  async upsertParticipant({
    roomId,
    session,
  }: {
    roomId: string
    session: StoredJigsawSession
  }): Promise<void> {
    const existingRows = await db
      .select()
      .from(jigsawRoomParticipantsSchema)
      .where(
        and(
          eq(jigsawRoomParticipantsSchema.roomId, roomId),
          eq(jigsawRoomParticipantsSchema.playerId, session.player.id)
        )
      )
      .limit(1)
    const now = new Date()
    const values = {
      anonSessionHash: hashToken(session.token),
      userId: session.userId ?? null,
      name: session.player.name,
      color: session.player.color,
      lastSeenAt: now,
      leftAt: null,
    }

    if (existingRows[0]) {
      await db
        .update(jigsawRoomParticipantsSchema)
        .set(values)
        .where(eq(jigsawRoomParticipantsSchema.id, existingRows[0].id))

      return
    }

    await db.insert(jigsawRoomParticipantsSchema).values({
      roomId,
      playerId: session.player.id,
      ...values,
      joinedAt: now,
    })
  }

  async markParticipantLeft(roomId: string, playerId: string): Promise<void> {
    const now = new Date()

    await db
      .update(jigsawRoomParticipantsSchema)
      .set({
        leftAt: now,
        lastSeenAt: now,
      })
      .where(
        and(
          eq(jigsawRoomParticipantsSchema.roomId, roomId),
          eq(jigsawRoomParticipantsSchema.playerId, playerId)
        )
      )
  }

  async updateParticipantProfile({
    sessionToken,
    player,
    userId,
  }: {
    sessionToken: string
    player: {
      id: string
      name: string
      color: string
    }
    userId?: string
  }): Promise<void> {
    await db
      .update(jigsawRoomParticipantsSchema)
      .set({
        userId: userId ?? null,
        name: player.name,
        color: player.color,
        lastSeenAt: new Date(),
      })
      .where(
        eq(
          jigsawRoomParticipantsSchema.anonSessionHash,
          hashToken(sessionToken)
        )
      )
  }

  async linkAnonSessionToUser(token: string, userId: string): Promise<void> {
    await db
      .update(jigsawRoomParticipantsSchema)
      .set({
        userId,
        lastSeenAt: new Date(),
      })
      .where(eq(jigsawRoomParticipantsSchema.anonSessionHash, hashToken(token)))
  }

  async recordCompletion(room: JigsawHistoryRoomInfo): Promise<void> {
    const participants = await this.readResultParticipants(room.roomId)

    await db
      .insert(jigsawRoomResultsSchema)
      .values({
        roomId: room.roomId,
        assetRef: room.assetRef,
        jigsawConfig: room.jigsawConfig,
        imageUrl: room.imageUrl,
        participants,
        elapsedMs: room.elapsedMs,
        pieceCount: room.pieceCount,
        snapCount: room.snapCount,
        completedAt: room.completedAt,
      })
      .onConflictDoNothing({
        target: jigsawRoomResultsSchema.roomId,
      })
  }

  async getUserHistory(userId: string): Promise<JigsawHistoryItem[]> {
    const participantRows = await db
      .select()
      .from(jigsawRoomParticipantsSchema)
      .where(eq(jigsawRoomParticipantsSchema.userId, userId))
    const roomIds = [...new Set(participantRows.map((row) => row.roomId))]

    if (!roomIds.length) {
      return []
    }

    const rows = await db
      .select()
      .from(jigsawRoomResultsSchema)
      .where(inArray(jigsawRoomResultsSchema.roomId, roomIds))
      .orderBy(desc(jigsawRoomResultsSchema.completedAt))

    const items = rows.flatMap((row) => {
      const item = toJigsawHistoryItem({
        roomId: row.roomId,
        assetRef: row.assetRef,
        imageUrl: row.imageUrl,
        jigsawConfig: row.jigsawConfig,
        elapsedMs: row.elapsedMs,
        pieceCount: row.pieceCount,
        snapCount: row.snapCount,
        completedAt: row.completedAt,
        participants: row.participants,
      })

      return item ? [item] : []
    })

    const colorsById = await this.loadCurrentUserColors(items)
    const colorFor = (userId?: string): string | undefined =>
      userId ? colorsById.get(userId) : undefined

    return items.map((item) => ({
      ...item,
      participants: item.participants.map((participant) => {
        const color = colorFor(participant.userId)

        return color ? { ...participant, color } : participant
      }),
    }))
  }

  async getRoomResult(roomId: string): Promise<JigsawRoomResult | null> {
    const rows = await db
      .select()
      .from(jigsawRoomResultsSchema)
      .where(eq(jigsawRoomResultsSchema.roomId, roomId))
      .limit(1)

    const row = rows[0]

    if (!row) {
      return null
    }

    const result = toJigsawRoomResult({
      roomId: row.roomId,
      assetRef: row.assetRef,
      imageUrl: row.imageUrl,
      jigsawConfig: row.jigsawConfig,
      elapsedMs: row.elapsedMs,
      pieceCount: row.pieceCount,
      snapCount: row.snapCount,
      completedAt: row.completedAt,
      participants: row.participants,
    })

    if (!result) {
      return null
    }

    const colorsById = await this.loadCurrentUserColors([result])

    return {
      ...result,
      participants: result.participants.map((participant) =>
        participant.userId && colorsById.has(participant.userId)
          ? { ...participant, color: colorsById.get(participant.userId)! }
          : participant
      ),
    }
  }

  private async loadCurrentUserColors(
    items: ReadonlyArray<{
      participants: readonly JigsawResultParticipant[]
    }>
  ): Promise<Map<string, string>> {
    const userIds = new Set<string>()

    for (const item of items) {
      for (const participant of item.participants) {
        if (participant.userId) {
          userIds.add(participant.userId)
        }
      }
    }

    if (userIds.size === 0) {
      return new Map()
    }

    const users = await db
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
  ): Promise<JigsawResultParticipant[]> {
    const participants = await db
      .select()
      .from(jigsawRoomParticipantsSchema)
      .where(eq(jigsawRoomParticipantsSchema.roomId, roomId))
    const userIds = [
      ...new Set(
        participants.flatMap((row) => (row.userId ? [row.userId] : []))
      ),
    ]
    const users = userIds.length
      ? await db
          .select()
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
