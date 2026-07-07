import type { CommandContext } from "grammy"

import type { BotContext } from "@/bot/types"

export async function handleStart(ctx: CommandContext<BotContext>) {
  await ctx.reply(
    "Кидай картинки.\n\nМожно пачкой, можно по одной, можно как попало.\nЯ разберусь."
  )
}
