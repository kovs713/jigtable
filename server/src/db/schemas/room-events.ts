import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core"

import type {
  RoomEventPayloadMap,
  RoomEventType,
} from "@jigtable/core/session-history"

import { usersSchema } from "./users"

export const roomEventsSchema = pgTable(
  "room_events",
  {
    id: uuid("id").primaryKey(),
    roomId: text("room_id").notNull(),
    sequence: bigint("sequence", { mode: "number" }).notNull(),
    commandId: uuid("command_id").notNull(),
    eventIndex: integer("event_index").notNull(),
    playerId: text("player_id"),
    userId: uuid("user_id").references((): AnyPgColumn => usersSchema.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").$type<RoomEventType>().notNull(),
    payload: jsonb("payload")
      .$type<RoomEventPayloadMap[RoomEventType]>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("room_events_room_sequence_uidx").on(
      table.roomId,
      table.sequence
    ),
    uniqueIndex("room_events_room_command_event_uidx").on(
      table.roomId,
      table.commandId,
      table.eventIndex
    ),
    index("room_events_room_created_at_idx").on(table.roomId, table.createdAt),
    index("room_events_room_type_sequence_idx").on(
      table.roomId,
      table.eventType,
      table.sequence
    ),
    index("room_events_player_room_sequence_idx").on(
      table.playerId,
      table.roomId,
      table.sequence
    ),
    index("room_events_user_created_at_idx").on(table.userId, table.createdAt),
  ]
)
