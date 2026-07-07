import type { CommandContext } from "grammy"

import type { BotContext } from "@/bot/types"
import {
  renderUploadKeyboard,
  deleteMessageSafe,
  getStatusMessageId,
  setStatusMessageId,
  clearStatusMessageId,
  getViewerMessageId,
  clearViewerMessageId,
} from "@/bot/upload"
import { db } from "@/infra/db"
import { batchesSchema } from "@/infra/db/schemas"

export async function handleNew(ctx: CommandContext<BotContext>) {
  if (!ctx.from) {
    await ctx.reply("не вижу юзера, не могу начать")
    return
  }

  const chatId = ctx.chat?.id
  if (chatId) {
    if (ctx.session.upload?.statusRefreshTimer) {
      clearTimeout(ctx.session.upload.statusRefreshTimer)
    }
    await deleteMessageSafe(ctx, chatId, getStatusMessageId(chatId))
    clearStatusMessageId(chatId)
    await deleteMessageSafe(ctx, chatId, getViewerMessageId(chatId))
    clearViewerMessageId(chatId)
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

  ctx.session.upload = {
    images: [],
    duplicateCount: 0,
    seenFileUniqueIds: [],
  }

  const text = [
    "Кидай картинки.",
    "",
    "Можно пачкой, можно по одной, можно как попало.",
    "Я разберусь.",
  ].join("\n")

  const keyboard = renderUploadKeyboard(ctx.session.upload)

  try {
    const msg = await ctx.api.sendMessage(ctx.chat!.id, text, {
      reply_markup: { inline_keyboard: keyboard },
    })
    if (chatId) {
      setStatusMessageId(chatId, msg.message_id)
    }
  } catch (error) {
    console.error("Failed to send initial status panel", error)
    await ctx.reply(text)
  }
}
