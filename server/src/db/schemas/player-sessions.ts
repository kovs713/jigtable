import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"

export const playerSessionsSchema = pgTable("player_sessions", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  expiredAt: timestamp("expired_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
})
