import { eq } from "drizzle-orm"

import { db } from "@/infra/db"
import { whitelistUsersSchema } from "@/infra/db/schemas"

export const WHITELIST_DENIED_MESSAGE = "Telegram user is not whitelisted"

export class WhitelistDeniedError extends Error {
  constructor() {
    super(WHITELIST_DENIED_MESSAGE)
    this.name = "WhitelistDeniedError"
  }
}

export async function requireWhitelistedTelegramUserId(
  value: string | number
): Promise<number> {
  const userId = parseTelegramUserId(value)

  if (!userId || !(await isWhitelistedTelegramUserId(userId))) {
    throw new WhitelistDeniedError()
  }

  return userId
}

export async function isWhitelistedTelegramUserId(
  value: string | number
): Promise<boolean> {
  const userId = parseTelegramUserId(value)

  if (!userId) {
    return false
  }

  if (isConfiguredAdminTelegramUserId(userId)) {
    return true
  }

  return Boolean(await readWhitelistUser(userId))
}

export async function isAdminTelegramUserId(
  value: string | number
): Promise<boolean> {
  const userId = parseTelegramUserId(value)

  if (!userId) {
    return false
  }

  if (isConfiguredAdminTelegramUserId(userId)) {
    return true
  }

  return Boolean((await readWhitelistUser(userId))?.isAdmin)
}

export function isWhitelistDeniedError(
  error: unknown
): error is WhitelistDeniedError {
  return error instanceof WhitelistDeniedError
}

export function parseTelegramUserId(value: string | number): number | null {
  const userId = typeof value === "number" ? value : Number(value.trim())

  if (
    !Number.isSafeInteger(userId) ||
    userId <= 0 ||
    !Number.isFinite(userId)
  ) {
    return null
  }

  return userId
}

function isConfiguredAdminTelegramUserId(userId: number): boolean {
  const adminUserId = parseTelegramUserId(process.env.ADMIN_USER_ID)

  return adminUserId === userId
}

async function readWhitelistUser(userId: number) {
  const rows = await db
    .select()
    .from(whitelistUsersSchema)
    .where(eq(whitelistUsersSchema.user_id, userId))
    .limit(1)

  return rows[0] ?? null
}
