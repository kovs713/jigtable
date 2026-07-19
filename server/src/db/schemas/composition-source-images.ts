import {
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core"

import { compositionsSchema } from "./compositions"

export type CompositionSourceImage =
  typeof compositionSourceImagesSchema.$inferSelect

export const compositionSourceImagesSchema = pgTable(
  "composition_source_images",
  {
    fileId: text("file_id").primaryKey(),
    compositionId: uuid("composition_id")
      .notNull()
      .references((): AnyPgColumn => compositionsSchema.compositionId, {
        onDelete: "cascade",
      }),
    objectKey: text("object_key").notNull().default(""),
    contentType: text("content_type").notNull().default("image/jpeg"),
    sortOrder: integer("sort_order").notNull().default(0),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  }
)
