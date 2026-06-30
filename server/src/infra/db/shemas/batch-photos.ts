import {
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core"

import { batchesSchema } from "./batches"

export const batchPhotosSchema = pgTable("batch_photos", {
  fileId: text("file_id").primaryKey(),
  batchId: uuid("batch_id")
    .notNull()
    .references((): AnyPgColumn => batchesSchema.batchId, {
      onDelete: "cascade",
    }),
  objectKey: text("object_key").notNull().default(""),
  contentType: text("content_type").notNull().default("image/jpeg"),
  sortOrder: integer("sort_order").notNull().default(0),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
})
