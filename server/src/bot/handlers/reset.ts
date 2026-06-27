import type { CommandContext } from "grammy"

import { deletePhoto } from "../../features/delete-photo"
import type { BotContext } from "../types"

export async function handleReset(ctx: CommandContext<BotContext>) {
  await ctx.reply("command reset и че бля")

  if (!ctx.from) {
    await ctx.reply("ну и иди нахуй")
    return
  }

  ctx.session.isStarted = false

  if (ctx.session.photos.length) {
    for (const photo of ctx.session.photos) {
      await deletePhoto(ctx.chat.id, ctx.from.id, photo)
    }
    ctx.session.photos = []
  }
}
