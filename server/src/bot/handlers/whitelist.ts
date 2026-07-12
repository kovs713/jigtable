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

  if ((command === "add" || command === "rm") && !whitelistCandidate) {
    await ctx.reply("user_id invalid. Команды: add <user_id>, rm <user_id>")
    return
  }

  if (command == "add") {
    const targetUserId = whitelistCandidate!
    const user = await db
      .select()
      .from(whitelistUsersSchema)
      .where(eq(whitelistUsersSchema.user_id, targetUserId))
      .limit(1)

    if (user.length) {
      await ctx.reply("Пользователь уже был добавлен в вайтлист")
      return
    }

    await db.insert(whitelistUsersSchema).values({
      user_id: targetUserId,
    })

    await ctx.reply("Пользователь удален из вайтлиста")
    return
  } else {
    await ctx.reply(
      "Такой команды не существует. Команды: add <user_id>, rm <user_id>"
    )
    return
  }
}

async function replyWhitelist(ctx: CommandContext<BotContext>): Promise<void> {
  const users = await db
    .select()
    .from(whitelistUsersSchema)
    .where(eq(whitelistUsersSchema.isAdmin, false))

  if (!users.length) {
    await ctx.reply("Вайтлист пуст")
    return
  }

  const text = [
    `Вайтлист: ${users.length}`,
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
