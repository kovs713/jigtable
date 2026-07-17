import type { CommandContext } from "grammy"

import type { BotContext } from "@/bot/types"

export async function handleStart(
  ctx: CommandContext<BotContext>
): Promise<void> {
  await ctx.reply(ctx.t("start-message"))
}
