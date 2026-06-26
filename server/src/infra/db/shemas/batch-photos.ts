import {
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { batchesSchema } from "./batches";

export const batchPhotosSchema = pgTable("batch_photos", {
  fileId: text("file_id").primaryKey(),
  batch_id: uuid("batch_id")
    .notNull()
    .references((): AnyPgColumn => batchesSchema.batchId, {
      onDelete: "cascade",
    }),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
