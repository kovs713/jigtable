import { CryptoHasher } from "bun"
import { and, desc, eq, inArray } from "drizzle-orm"

import type { PuzzlePlayer } from "@puzzle-shuffle/puzzle-core"

import { db } from "@/infra/db"
import {
  puzzleRoomParticipantsSchema,
  puzzleRoomResultsSchema,
  usersSchema,
  type PuzzleResultParticipant,
  type PuzzleSafeAssetRef,
} from "@/infra/db/shemas"
import type { StoredPuzzleSession } from "./session-store"

export interface PuzzleHistoryRoomInfo {
  roomId: string
  assetRef: PuzzleSafeAssetRef
  elapsedMs: number
  pieceCount: number
  snapCount: number
  completedAt: Date
}

export interface PuzzleHistoryItem {
  roomId: string
  completedAt: Date
  elapsedMs: number
  pieceCount: number
  snapCount: number
  source: {
    kind: PuzzleSafeAssetRef["kind"]
    label: string
  }
  participants: PuzzleResultParticipant[]
}

export class PuzzleHistoryStore {
  async upsertParticipant({
    roomId,
    session,
  }: {
    roomId: string
    session: StoredPuzzleSession
  }): Promise<void> {
    const existingRows = await db
      .select()
      .from(puzzleRoomParticipantsSchema)
      .where(
        and(
          eq(puzzleRoomParticipantsSchema.roomId, roomId),
          eq(puzzleRoomParticipantsSchema.playerId, session.player.id)
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
        .update(puzzleRoomParticipantsSchema)
        .set(values)
        .where(eq(puzzleRoomParticipantsSchema.id, existingRows[0].id))
      return
    }

    await db.insert(puzzleRoomParticipantsSchema).values({
      roomId,
      playerId: session.player.id,
      ...values,
      joinedAt: now,
    })
  }

  async markParticipantLeft(roomId: string, playerId: string): Promise<void> {
    const now = new Date()

    await db
      .update(puzzleRoomParticipantsSchema)
      .set({ leftAt: now, lastSeenAt: now })
      .where(
        and(
          eq(puzzleRoomParticipantsSchema.roomId, roomId),
          eq(puzzleRoomParticipantsSchema.playerId, playerId)
        )
      )
  }

  async updateParticipantProfile({
    sessionToken,
    player,
    userId,
  }: {
    sessionToken: string
    player: PuzzlePlayer
    userId?: string
  }): Promise<void> {
    await db
      .update(puzzleRoomParticipantsSchema)
      .set({
        userId: userId ?? null,
        name: player.name,
        color: player.color,
        lastSeenAt: new Date(),
      })
      .where(
        eq(
          puzzleRoomParticipantsSchema.anonSessionHash,
          hashToken(sessionToken)
        )
      )
  }

  async linkAnonSessionToUser(token: string, userId: string): Promise<void> {
    await db
      .update(puzzleRoomParticipantsSchema)
      .set({ userId, lastSeenAt: new Date() })
      .where(eq(puzzleRoomParticipantsSchema.anonSessionHash, hashToken(token)))
  }

  async recordCompletion(room: PuzzleHistoryRoomInfo): Promise<void> {
    const participants = await this.readResultParticipants(room.roomId)

    await db
      .insert(puzzleRoomResultsSchema)
      .values({
        roomId: room.roomId,
        assetRef: room.assetRef,
        participants,
        elapsedMs: room.elapsedMs,
        pieceCount: room.pieceCount,
        snapCount: room.snapCount,
        completedAt: room.completedAt,
      })
      .onConflictDoNothing({ target: puzzleRoomResultsSchema.roomId })
  }

  async getUserHistory(userId: string): Promise<PuzzleHistoryItem[]> {
    const participantRows = await db
      .select()
      .from(puzzleRoomParticipantsSchema)
      .where(eq(puzzleRoomParticipantsSchema.userId, userId))
    const roomIds = [...new Set(participantRows.map((row) => row.roomId))]

    if (!roomIds.length) {
      return []
    }

    const rows = await db
      .select()
      .from(puzzleRoomResultsSchema)
      .where(inArray(puzzleRoomResultsSchema.roomId, roomIds))
      .orderBy(desc(puzzleRoomResultsSchema.completedAt))

    return rows.map((row) => ({
      roomId: row.roomId,
      completedAt: row.completedAt,
      elapsedMs: row.elapsedMs,
      pieceCount: row.pieceCount,
      snapCount: row.snapCount,
      source: summarizeAssetRef(row.assetRef),
      participants: row.participants,
    }))
  }

  private async readResultParticipants(
    roomId: string
  ): Promise<PuzzleResultParticipant[]> {
    const participants = await db
      .select()
      .from(puzzleRoomParticipantsSchema)
      .where(eq(puzzleRoomParticipantsSchema.roomId, roomId))
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

export function createPuzzleSafeAssetRef({
  imageUrl,
  assetId,
}: {
  imageUrl: string
  assetId: string
}): PuzzleSafeAssetRef {
  const url = new URL(imageUrl, process.env.CLIENT_URL)

  if (url.pathname === "/test_puzzle.png") {
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
  assetRef: PuzzleSafeAssetRef
): PuzzleHistoryItem["source"] {
  if (assetRef.kind === "dev") {
    return { kind: assetRef.kind, label: "Test puzzle" }
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
