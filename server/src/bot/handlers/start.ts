import type { CommandContext } from "grammy"

import type { BotContext } from "@/bot/types"
import { keyboard } from "@/bot/ui"

export async function handleStart(ctx: CommandContext<BotContext>) {
  await ctx.reply(
    `
кидай свои шакальные высеры
сделаю один большой шакальный высер.
  `,
    {
      reply_markup: keyboard,
    }
  )
}
