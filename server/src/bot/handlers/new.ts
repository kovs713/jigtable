import type { CommandContext } from "grammy"

import type { BotContext } from "../types"
import { keyboard } from "../ui"

export async function handleNew(ctx: CommandContext<BotContext>) {
  await ctx.reply("и че бля отправляй свой шлак уже", {
    reply_markup: keyboard,
  })
  ctx.session.isStarted = true
}
