import type { CommandContext, Context } from "grammy";

export function handleNew(ctx: CommandContext<Context>) {
  ctx.reply("command new и че бля");
}
