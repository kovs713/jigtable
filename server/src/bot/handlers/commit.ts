import type { CommandContext } from "grammy"
import type { BotContext } from "../types"

export async function handleCommit(
  ctx: CommandContext<BotContext>
): Promise<void> {
  // TODO: пагинация сообщения списьки письки и тд
  if (!ctx.session.isStarted) {
    await ctx.reply(
      "бля, далбаеб, ты не то что не скинул нихуя еще, ты даже не начал процесс, ебанат, /new есть, пресс баттнс уебище"
    )
  }
}
