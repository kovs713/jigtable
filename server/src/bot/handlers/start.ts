import type { CommandContext, Context } from "grammy";

export function handleStart(ctx: CommandContext<Context>) {
  ctx.reply(`
кидай свои шакальные высеры
сделаю один большой шакальный высер.
  `);
}
