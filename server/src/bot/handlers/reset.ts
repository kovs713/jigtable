import type { CommandContext, Context } from "grammy";

export function handleReset(ctx: CommandContext<Context>) {
  ctx.reply("command reset и че бля");
}
