import { CryptoHasher } from "bun"
import { and, desc, eq, inArray } from "drizzle-orm"

import type { JigsawConfig, JigsawPlayer } from "@jigtable/jigsaw-core"

import { db } from "@/infra/db"
import {
  jigsawRoomParticipantsSchema,
  jigsawRoomResultsSchema,
  usersSchema,
  type JigsawResultParticipant,
  type JigsawSafeAssetRef,
} from "@/infra/db/schemas"
import type { StoredJigsawSession } from "./session-store"

export interface JigsawHistoryRoomInfo {
  roomId: string
  assetRef: JigsawSafeAssetRef
  imageUrl: string
  jigsawConfig: JigsawConfig
  elapsedMs: number
  pieceCount: number
  snapCount: number
  completedAt: Date
}

export interface JigsawHistoryItem {
  roomId: string
  completedAt: Date
  elapsedMs: number
  pieceCount: number
  snapCount: number
  imageUrl: string | null
  jigsawConfig: JigsawConfig | null
  source: {
    kind: JigsawSafeAssetRef["kind"]
    label: string
  }
  participants: JigsawResultParticipant[]
}

export interface JigsawRoomResult {
  roomId: string
  imageUrl: string | null
  jigsawConfig: JigsawConfig | null
  elapsedMs: number
  pieceCount: number
  snapCount: number
  completedAt: Date
  participants: JigsawResultParticipant[]
}

export class JigsawHistoryStore {
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
      .set({ leftAt: now, lastSeenAt: now })
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
    player: JigsawPlayer
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
      .set({ userId, lastSeenAt: new Date() })
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
      .onConflictDoNothing({ target: jigsawRoomResultsSchema.roomId })
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

    return rows.map((row) => ({
      roomId: row.roomId,
      completedAt: row.completedAt,
      elapsedMs: row.elapsedMs,
      pieceCount: row.pieceCount,
      snapCount: row.snapCount,
      imageUrl: row.imageUrl,
      jigsawConfig: row.jigsawConfig,
      source: summarizeAssetRef(row.assetRef),
      participants: row.participants,
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

    return {
      roomId: row.roomId,
      imageUrl: row.imageUrl,
      jigsawConfig: row.jigsawConfig,
      elapsedMs: row.elapsedMs,
      pieceCount: row.pieceCount,
      snapCount: row.snapCount,
      completedAt: row.completedAt,
      participants: row.participants,
    }
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

export function createJigsawSafeAssetRef({
  imageUrl,
  assetId,
}: {
  imageUrl: string
  assetId: string
}): JigsawSafeAssetRef {
  const url = new URL(imageUrl, process.env.CLIENT_URL)

  if (url.pathname === "/test_jigsaw.png") {
    return { kind: "dev", assetId }
  }

  if (url.pathname.startsWith("/api/batches/")) {
    const parts = url.pathname.split("/").filter(Boolean)

    if (parts[1] === "batches" && parts[2] && parts[3] === "rendered") {
      return { kind: "batch_render", batchId: parts[2], assetId }
    }
  }

  return {
    kind: "external",
    assetId,
    sourceHash: hashToken(url.toString()),
    origin: url.origin,
  }
}

function summarizeAssetRef(
  assetRef: JigsawSafeAssetRef
): JigsawHistoryItem["source"] {
  if (assetRef.kind === "dev") {
    return { kind: assetRef.kind, label: "Test jigsaw" }
  }

  if (assetRef.kind === "batch_render") {
    return { kind: assetRef.kind, label: "Rendered collage" }
  }

  return {
    kind: assetRef.kind,
    label: assetRef.origin
      ? `External image from ${assetRef.origin}`
      : "External image",
  }
}

function hashToken(token: string): string {
  return new CryptoHasher("sha256").update(token).digest("hex")
}
