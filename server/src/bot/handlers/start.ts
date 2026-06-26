import type { CommandContext } from "grammy";

import type { BotContext } from "../types";

export function handleStart(ctx: CommandContext<BotContext>) {
  ctx.reply(`
кидай свои шакальные высеры
сделаю один большой шакальный высер.
  `);
}
