import { eq } from "drizzle-orm"

import { number } from "@jigtable/shared/schemas"

import { db } from "@/db"
import { whitelistUsersSchema } from "@/db/schemas"
import { ApiError } from "@/api/http/errors"

export const WHITELIST_DENIED_MESSAGE = "Telegram user is not whitelisted"

export async function requireWhitelistedTelegramUserId(
  value: number
): Promise<number> {
  const parsedUserId = number().parse(value)

  if (!parsedUserId.ok || !(await isWhitelistedUser(parsedUserId.value))) {
    throw new ApiError("Bot whitelist unauthorized", 401)
  }

  return parsedUserId.value
}

export async function isWhitelistedUser(userId: number): Promise<boolean> {
  const parsedUserId = number().parse(userId)
  if (!parsedUserId.ok) return false

  if (parsedUserId.value === Number(process.env.ADMIN_USER_ID)) return true

  const exists = await db
    .select()
    .from(whitelistUsersSchema)
    .where(eq(whitelistUsersSchema.user_id, parsedUserId.value))
    .limit(1)

  return exists.length > 0
}
