import { eq } from "drizzle-orm"
import type { CommandContext } from "grammy"

import {
  isAdminTelegramUserId,
  isWhitelistedTelegramUserId,
  parseTelegramUserId,
} from "@/auth"
import { db } from "@/infra/db"
import { whitelistUsersSchema } from "@/infra/db/schemas"
import type { BotContext } from "../types"

export async function isAdmin(userId: number): Promise<boolean> {
  return isAdminTelegramUserId(userId)
}

export async function isWhitelisted(userId: number): Promise<boolean> {
  return isWhitelistedTelegramUserId(userId)
}

export async function handleWhitelist(
  ctx: CommandContext<BotContext>
): Promise<void> {
  const userId = ctx.from?.id

  if (!userId || !(await isAdmin(userId))) {
    return
  }

  const match = ctx.match.trim().split(/\s+/).filter(Boolean)

  if (!match.length) {
    await replyWhitelist(ctx)
    return
  }

  const command = match[0]
  const whitelistCandidate = parseTelegramUserId(match[1] ?? "")

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
    await ctx.reply("Пользователь добавлен в вайтлист")
  } else if (command == "rm") {
    const targetUserId = whitelistCandidate!
    const user = await db
      .select()
      .from(whitelistUsersSchema)
      .where(eq(whitelistUsersSchema.user_id, targetUserId))
      .limit(1)

    if (!user.length) {
      await ctx.reply("Такой пользователь не был добавлен в вайтлист")
      return
    }

    await db
      .delete(whitelistUsersSchema)
      .where(eq(whitelistUsersSchema.user_id, targetUserId))

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
