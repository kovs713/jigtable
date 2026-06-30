import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

import type { ShuffleResult } from "../../../shuffle"

export const PhotoBatchStatus = {
  Collecting: "collecting",
  Ready: "ready",
  Processing: "processing",
  Completed: "completed",
  Failed: "failed",
  Canceled: "canceled",
} as const

export type PhotoBatchStatus =
  (typeof PhotoBatchStatus)[keyof typeof PhotoBatchStatus]

export const batchesSchema = pgTable("batches", {
  batchId: uuid("batch_id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  editToken: text("edit_token").notNull().default("legacy-token"),
  status: text("status")
    .default(PhotoBatchStatus.Collecting)
    .$type<PhotoBatchStatus>(),
  layout: jsonb("layout").$type<ShuffleResult>(),
  outputKey: text("output_key"),
  outputFormat: text("output_format"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})
