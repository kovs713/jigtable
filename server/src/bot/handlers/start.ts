import type { CommandContext } from "grammy";

import type { BotContext } from "../types";

export async function handleStart(ctx: CommandContext<BotContext>) {
  await ctx.reply(`
кидай свои шакальные высеры
сделаю один большой шакальный высер.
  `);
}
