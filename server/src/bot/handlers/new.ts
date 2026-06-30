import type { CommandContext } from "grammy"

import { db } from "../../infra/db"
import { batchesSchema } from "../../infra/db/shemas"
import type { BotContext } from "../types"
import { keyboard } from "../ui"

export async function handleNew(ctx: CommandContext<BotContext>) {
  if (!ctx.from) {
    await ctx.reply("не вижу юзера, не могу начать")
    return
  }

  const [batch] = await db
    .insert(batchesSchema)
    .values({
      userId: String(ctx.from.id),
      editToken: crypto.randomUUID(),
    })
    .returning()

  if (!batch) {
    throw new Error("Failed to create photo batch")
  }

  ctx.session.activeBatchId = batch.batchId
  ctx.session.photos = []
  ctx.session.isStarted = true

  await ctx.reply("и че бля отправляй свой шлак уже", {
    reply_markup: keyboard,
  })
}
