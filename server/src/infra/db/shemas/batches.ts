import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const PhotoBatchStatus = {
  Collecting: "collecting",
  Ready: "ready",
  Processing: "processing",
  Completed: "completed",
  Failed: "failed",
  Canceled: "canceled",
} as const;

export type PhotoBatchStatus =
  (typeof PhotoBatchStatus)[keyof typeof PhotoBatchStatus];

export const batchesSchema = pgTable("batches", {
  batchId: uuid("batch_id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  status: text("status")
    .default(PhotoBatchStatus.Collecting)
    .$type<PhotoBatchStatus>(),
  createdAt: timestamp("created_at").defaultNow(),
});
