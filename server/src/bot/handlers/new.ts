import type { CommandContext } from "grammy";

import type { BotContext } from "../types";

export async function handleNew(ctx: CommandContext<BotContext>) {
  await ctx.reply("и че бля отправляй свой шлак уже, суйте мне");
  ctx.session.isStarted = true;
}
