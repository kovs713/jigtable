import {
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core"

import { usersSchema } from "./users"

export const roomParticipantsSchema = pgTable("jigsaw_room_participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomId: text("room_id").notNull(),
  playerId: text("player_id").notNull(),
  anonSessionHash: text("anon_session_hash").notNull(),
  userId: uuid("user_id").references((): AnyPgColumn => usersSchema.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  color: text("color").notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  leftAt: timestamp("left_at", { withTimezone: true }),
})
