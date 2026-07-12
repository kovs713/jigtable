import { eq } from "drizzle-orm"
import type { CommandContext } from "grammy"

import { number } from "@jigtable/shared/schemas"

import { db } from "@/db"
import { whitelistUsersSchema } from "@/db/schemas"
import { isWhitelistedUser } from "@/services/auth"
import type { BotContext } from "../types"

export function isAdmin(userId: number): boolean {
  return userId === Number(process.env.ADMIN_USER_ID)
}

export async function isWhitelisted(userId: number): Promise<boolean> {
  return isWhitelistedUser(userId)
}

export async function handleWhitelist(
  ctx: CommandContext<BotContext>
): Promise<void> {
  const match = ctx.match.trim().split(/\s+/).filter(Boolean)

  if (!match.length) {
    await replyWhitelist(ctx)
    return
  }

  const command = match[0]

  if (command !== "add" && command !== "rm") {
    await ctx.reply(ctx.t("whitelist-invalid-command"))
    return
  }

  const whitelistCandidate = number().parse(Number(match[1]))

  if (!whitelistCandidate.ok) {
    await ctx.reply(ctx.t("whitelist-invalid-user-id"))
    return
  }

  const targetUserId = whitelistCandidate.value
  const user = await db
    .select()
    .from(whitelistUsersSchema)
    .where(eq(whitelistUsersSchema.user_id, targetUserId))
    .limit(1)

  if (command === "add") {
    if (user.length) {
      await ctx.reply(ctx.t("whitelist-user-already-added"))
      return
    }

    await db.insert(whitelistUsersSchema).values({
      user_id: targetUserId,
    })

    await ctx.reply(ctx.t("whitelist-user-added"))
    return
  }

  if (!user.length) {
    await ctx.reply(ctx.t("whitelist-user-not-found"))
    return
  }

  await db
    .delete(whitelistUsersSchema)
    .where(eq(whitelistUsersSchema.user_id, targetUserId))

  await ctx.reply(ctx.t("whitelist-user-removed"))
}

async function replyWhitelist(ctx: CommandContext<BotContext>): Promise<void> {
  const users = await db
    .select()
    .from(whitelistUsersSchema)
    .where(eq(whitelistUsersSchema.isAdmin, false))

  if (!users.length) {
    await ctx.reply(ctx.t("whitelist-empty"))
    return
  }

  const text = [
    ctx.t("whitelist-title", { count: users.length }),
    "",
    ...users.map((user, index) => `${index + 1}. ${user.user_id}`),
  ].join("\n")

  await ctx.reply(text)
}

export async function requireWhitelistedUser(
  ctx: BotContext,
  next: () => Promise<void>
): Promise<void> {
  const whitelistCommandCalled = ctx.hasCommand("whitelist")
  const userId = ctx.from?.id

  if (!userId) return

  if (whitelistCommandCalled) {
    if ((await isWhitelistedUser(userId)) || isAdmin(userId)) {
      await next()
    } else {
      console.warn(`Bot whitelist command denied user=${userId}`)
    }

    return
  }

  if (!(await isWhitelistedUser(userId))) {
    console.warn(`Bot update denied by whitelist user=${userId}`)
    await ctx.reply(ctx.t("whitelist-access"))
    return
  }

  await next()
}
