import type { CommandContext } from "grammy"

import type { BotContext } from "@/bot/types"
import { keyboard } from "@/bot/ui"

export async function handleStart(ctx: CommandContext<BotContext>) {
  console.log(`Bot /start handler user=${ctx.from?.id ?? "-"}`)

  await ctx.reply(
    `
кидай свои шакальные высеры
сделаю один большой шакальный высер.
  `,
    {
      reply_markup: keyboard,
    }
  )

  console.log(`Bot /start reply sent user=${ctx.from?.id ?? "-"}`)
}
