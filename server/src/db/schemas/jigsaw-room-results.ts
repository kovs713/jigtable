import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"

import type { JigsawConfig } from "@jigtable/core/types"

import type { AssetReference } from "@/services/history/types"

export type JigsawSafeAssetRef =
  | { kind: "dev"; assetId: string }
  | { kind: "jigsaw_image"; compositionId: string; assetId: string }
  | { kind: "external"; assetId: string; sourceHash: string; origin?: string }

export type StoredAssetReference =
  | AssetReference
  | JigsawSafeAssetRef
  | { kind: "batch_render"; batchId: string; assetId: string }

export interface JigsawResultParticipant {
  userId?: string
  telegramId?: string
  name: string
  color: string
}

export const jigsawRoomResultsSchema = pgTable("jigsaw_room_results", {
  roomId: text("room_id").primaryKey(),
  assetRef: jsonb("asset_ref").$type<StoredAssetReference>().notNull(),
  jigsawConfig: jsonb("jigsaw_config").$type<JigsawConfig>(),
  imageUrl: text("image_url"),
  participants: jsonb("participants")
    .$type<JigsawResultParticipant[]>()
    .notNull(),
  elapsedMs: integer("elapsed_ms").notNull(),
  pieceCount: integer("piece_count").notNull(),
  snapCount: integer("snap_count").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
})
