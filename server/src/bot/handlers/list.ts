import type { CommandContext } from "grammy"
import type { BotContext } from "../types"

export async function handleList(
  ctx: CommandContext<BotContext>
): Promise<void> {
  await ctx.reply("ну да /list и че")
}
