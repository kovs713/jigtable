import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core"

import { usersSchema } from "./users"

export const roomParticipantsSchema = pgTable(
  "room_participants",
  {
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
  },
  (table) => [
    uniqueIndex("room_participants_room_player_uidx").on(
      table.roomId,
      table.playerId
    ),
    index("room_participants_user_room_idx").on(table.userId, table.roomId),
    index("room_participants_anon_session_hash_idx").on(table.anonSessionHash),
  ]
)
