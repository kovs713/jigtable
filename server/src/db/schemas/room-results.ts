import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"

import type { JigsawConfig } from "@jigtable/core/types"
import type { SessionSummary } from "@jigtable/core/session-history"

export type SafeAssetReference =
  | { kind: "dev"; assetId: string }
  | { kind: "jigsaw_image"; compositionId: string; assetId: string }
  | { kind: "external"; assetId: string; sourceHash: string; origin?: string }

export type StoredAssetReference =
  | { kind: "development"; assetId: string }
  | { kind: "composition"; compositionId: string; assetId: string }
  | { kind: "external"; assetId: string; sourceHash: string; origin?: string }
  | SafeAssetReference
  | { kind: "batch_render"; batchId: string; assetId: string }

export type StoredResultParticipant = {
  /**
   * Отсутствует у legacy results.
   */
  playerId?: string

  /**
   * null — анонимный участник.
   * undefined — legacy result, где userId ещё не сохранялся.
   */
  userId?: string | null

  /**
   * Legacy identity, оставленная для чтения старых results.
   */
  telegramId?: string

  name: string
  color: string
}

export const roomResultsSchema = pgTable("room_results", {
  roomId: text("room_id").primaryKey(),
  assetRef: jsonb("asset_ref").$type<StoredAssetReference>().notNull(),
  jigsawConfig: jsonb("jigsaw_config").$type<JigsawConfig>(),
  imageUrl: text("image_url"),
  participants: jsonb("participants")
    .$type<StoredResultParticipant[]>()
    .notNull(),
  elapsedMs: integer("elapsed_ms").notNull(),
  pieceCount: integer("piece_count").notNull(),
  snapCount: integer("snap_count").notNull(),
  summary: jsonb("summary").$type<SessionSummary>(),
  scoringVersion: integer("scoring_version"),
  contributionVersion: integer("contribution_version"),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
})
