import type { BotContext } from "@/bot/types"
import {
  clearNavigationMessage,
  rememberNavigationMessage,
  replyWithMainMenu,
} from "@/bot/menu"
import {
  clearStatusPanel,
  deleteMessageSafe,
  refreshBottomStatus,
  rememberStatusMessage,
  renderUploadKeyboard,
} from "@/bot/upload/status"
import { db } from "@/db"
import { compositionsSchema } from "@/db/schemas"

export async function handleNew(ctx: BotContext): Promise<void> {
  if (!ctx.from) {
    await ctx.reply(ctx.t("user-not-found"))
    return
  }

  const chatId = ctx.chat?.id
  const previousUpload = ctx.session.upload

  if (!ctx.session.mainMenuShown) {
    await replyWithMainMenu(ctx, ctx.t("menu-ready"))
  }

  await clearNavigationMessage(ctx)

  if (ctx.session.isStarted && ctx.session.activeCompositionId) {
    if (previousUpload && chatId) {
      await refreshBottomStatus(ctx, chatId)
      return
    }

    const message = await ctx.reply(ctx.t("new-already-active"), {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: ctx.t("button-build"),
              callback_data: `menu:build:${ctx.session.activeCompositionId}`,
            },
            {
              text: ctx.t("button-cancel-upload"),
              callback_data: `upload:cancel:${ctx.session.activeCompositionId}`,
            },
          ],
        ],
      },
    })
    rememberNavigationMessage(ctx, message.message_id)
    return
  }

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
    const message = await ctx.api.sendMessage(ctx.chat!.id, text, {
      reply_markup: {
        inline_keyboard: renderUploadKeyboard(ctx, ctx.session.upload),
      },
    })

    if (chatId) {
      rememberStatusMessage(chatId, message.message_id)
      ctx.session.upload.statusMessageId = message.message_id
    }
  } catch (error) {
    console.error("Failed to send initial status panel", error)
    await ctx.reply(text)
  }
}
