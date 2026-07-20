import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core"

import { usersSchema } from "./users"

export const userXpTransactionsSchema = pgTable(
  "user_xp_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references((): AnyPgColumn => usersSchema.id, { onDelete: "cascade" }),
    roomId: text("room_id").notNull(),
    reason: text("reason").notNull(),
    amount: integer("amount").notNull(),
    scoringVersion: integer("scoring_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("user_xp_transactions_user_room_reason_uidx").on(
      table.userId,
      table.roomId,
      table.reason
    ),
    index("user_xp_transactions_user_created_at_idx").on(
      table.userId,
      table.createdAt
    ),
    index("user_xp_transactions_room_idx").on(table.roomId),
  ]
)
