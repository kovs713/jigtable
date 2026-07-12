import type { CommandContext } from "grammy"

import type { BotContext } from "@/bot/types"
import {
  clearStatusPanel,
  deleteMessageSafe,
  rememberStatusMessage,
  renderUploadKeyboard,
} from "@/bot/upload/status"
import { db } from "@/db"
import { compositionsSchema } from "@/db/schemas"

export async function handleNew(
  ctx: CommandContext<BotContext>
): Promise<void> {
  if (!ctx.from) {
    await ctx.reply("не вижу юзера, не могу начать")
    return
  }

  const chatId = ctx.chat?.id
  const previousUpload = ctx.session.upload

  if (chatId) {
    await clearStatusPanel(ctx, chatId)

    if (previousUpload?.viewerMessageId) {
      await deleteMessageSafe(ctx, chatId, previousUpload.viewerMessageId)
    }
  }

  const [composition] = await db
    .insert(compositionsSchema)
    .values({
      userId: String(ctx.from.id),
      editToken: crypto.randomUUID(),
    })
    .returning()

  if (!composition) {
    throw new Error("Failed to create composition")
  }

  ctx.session.activeCompositionId = composition.compositionId
  ctx.session.photos = []
  ctx.session.isStarted = true
  ctx.session.upload = {
    images: [],
    duplicateCount: 0,
    seenFileUniqueIds: [],
  }

  const text = ctx.t("new-message")

  try {
    const msg = await ctx.api.sendMessage(ctx.chat!.id, text, {
      reply_markup: { inline_keyboard: keyboard },
    })

    if (chatId) {
      rememberStatusMessage(chatId, message.message_id)
    }
  } catch (error) {
    console.error("Failed to send initial status panel", error)
    await ctx.reply(text)
  }
}
