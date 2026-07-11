import { bigint, boolean, pgTable } from "drizzle-orm/pg-core"

export const whitelistUsersSchema = pgTable("whitelist_users", {
  user_id: bigint("user_id", { mode: "number" }).primaryKey(),
  isAdmin: boolean("is_admin").notNull().default(false),
})
