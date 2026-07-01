import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"

export type PuzzleSafeAssetRef =
  | { kind: "dev"; assetId: string }
  | { kind: "batch_render"; batchId: string; assetId: string }
  | { kind: "external"; assetId: string; sourceHash: string; origin?: string }

export interface PuzzleResultParticipant {
  userId?: string
  telegramId?: string
  name: string
  color: string
}

export const puzzleRoomResultsSchema = pgTable("puzzle_room_results", {
  roomId: text("room_id").primaryKey(),
  assetRef: jsonb("asset_ref").$type<PuzzleSafeAssetRef>().notNull(),
  participants: jsonb("participants")
    .$type<PuzzleResultParticipant[]>()
    .notNull(),
  elapsedMs: integer("elapsed_ms").notNull(),
  pieceCount: integer("piece_count").notNull(),
  snapCount: integer("snap_count").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
})
