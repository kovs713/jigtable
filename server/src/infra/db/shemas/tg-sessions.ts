import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"

export const tgSessionsShema = pgTable("tg_sessions", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
})
