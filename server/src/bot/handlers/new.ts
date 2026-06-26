import type { CommandContext } from "grammy";

import type { BotContext } from "../types";

export function handleNew(ctx: CommandContext<BotContext>) {
  ctx.reply("и че бля отправляй свой шлак уже, суйте мне");
  ctx.session.isStarted = true;
}
