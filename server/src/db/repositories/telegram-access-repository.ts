import { eq } from "drizzle-orm"

import { db } from "@/db"
import { whitelistUsersSchema } from "@/db/schemas"
import type { TelegramAccessRepository } from "@/services/auth"

export class DrizzleTelegramAccessRepository implements TelegramAccessRepository {
  async contains(telegramUserId: number): Promise<boolean> {
    const [row] = await db
      .select({ id: whitelistUsersSchema.user_id })
      .from(whitelistUsersSchema)
      .where(eq(whitelistUsersSchema.user_id, telegramUserId))
      .limit(1)

    return Boolean(row)
  }
}
