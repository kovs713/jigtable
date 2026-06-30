import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"

export const usersSchema = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    telegramId: text("telegram_id").notNull(),
    username: text("username"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    photoUrl: text("photo_url"),
    displayName: text("display_name").notNull(),
    color: text("color").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("users_telegram_id_idx").on(table.telegramId)]
)
