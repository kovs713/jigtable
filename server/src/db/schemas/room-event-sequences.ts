import { bigint, pgTable, text } from "drizzle-orm/pg-core"

export const roomEventSequencesSchema = pgTable("room_event_sequences", {
  roomId: text("room_id").primaryKey(),
  nextSequence: bigint("next_sequence", { mode: "number" }).notNull(),
})
