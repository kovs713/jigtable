import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

import type { CompositionLayout } from "@/native/composition-layout-engine"

export const CompositionStatus = {
  Collecting: "collecting",
  Ready: "ready",
  Processing: "processing",
  Completed: "completed",
  Failed: "failed",
  Canceled: "canceled",
} as const

export type CompositionStatus =
  (typeof CompositionStatus)[keyof typeof CompositionStatus]

export const compositionsSchema = pgTable("compositions", {
  compositionId: uuid("composition_id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  editToken: text("edit_token").notNull(),
  status: text("status")
    .default(CompositionStatus.Collecting)
    .$type<CompositionStatus>(),
  layout: jsonb("layout").$type<CompositionLayout>(),
  jigsawImageKey: text("jigsaw_image_key"),
  jigsawImageFormat: text("jigsaw_image_format"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})
