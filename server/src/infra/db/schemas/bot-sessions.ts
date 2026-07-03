import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"

export const botSessionsSchema = pgTable("bot_sessions", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
})
