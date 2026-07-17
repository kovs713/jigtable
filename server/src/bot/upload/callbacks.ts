import type { Bot } from "grammy"

import type {
  BotContext,
  CallbackQueryContext,
  UploadSession,
} from "@/bot/types"
import {
  deleteMessageSafe,
  refreshBottomStatus,
  renderUploadKeyboard,
  renderUploadStatus,
  renderViewerCaption,
  renderViewerKeyboard,
} from "./status"
import {
  deleteCurrentViewerImage,
  getActiveImages,
  getCurrentViewerIndex,
  getViewerImage,
  selectNextViewerImage,
  selectPrevViewerImage,
} from "./viewer"

export function registerUploadCallbacks(bot: Bot<BotContext>): void {
  bot.callbackQuery("upload:view", handleUploadView)
  bot.callbackQuery("upload:build", handleUploadBuild)
  bot.callbackQuery("upload:delete_last", handleUploadDeleteLast)
  bot.callbackQuery("upload:clear", handleUploadClear)
  bot.callbackQuery("upload:clear_confirm", handleUploadClearConfirm)
  bot.callbackQuery("upload:clear_cancel", handleUploadClearCancel)

  bot.callbackQuery("viewer:next", handleViewerNext)
  bot.callbackQuery("viewer:prev", handleViewerPrev)
  bot.callbackQuery("viewer:delete", handleViewerDelete)
  bot.callbackQuery("viewer:back", handleViewerBack)
  bot.callbackQuery("viewer:build", handleViewerBuild)
  bot.callbackQuery("viewer:noop", handleViewerNoop)
}

function chatId(ctx: CallbackQueryContext): number {
  return ctx.chat!.id
}

async function handleUploadView(ctx: CallbackQueryContext): Promise<void> {
  const session = ctx.session.upload

  if (!session) {
    await ctx.answerCallbackQuery()
    return
  }

  const active = getActiveImages(session)

  if (active.length === 0) {
    await ctx.answerCallbackQuery({
      text: ctx.t("upload-nothing-to-show"),
    })
    return
  }

  session.viewerImageId ??= active[0]?.id

  await ctx.answerCallbackQuery()
  await sendViewer(ctx, session)
}

async function handleUploadBuild(ctx: CallbackQueryContext): Promise<void> {
  const session = ctx.session.upload

  if (!session) {
    await ctx.answerCallbackQuery()
    return
  }

  const active = getActiveImages(session)

  await ctx.answerCallbackQuery()
  await ctx.editMessageText(ctx.t("upload-building", { count: active.length }))

  const id = chatId(ctx)

  await deleteMessageSafe(ctx, id, session.viewerMessageId)
  session.viewerMessageId = undefined

  if (!ctx.session.activeCompositionId) {
    await ctx.reply(ctx.t("upload-no-active-composition"))
    return
  }

  const { handleCommit } = await import("@/bot/handlers/commit")
  await handleCommit(ctx)
}

async function handleUploadDeleteLast(
  ctx: CallbackQueryContext
): Promise<void> {
  const session = ctx.session.upload

  if (!session) {
    await ctx.answerCallbackQuery()
    return
  }

  const last = getActiveImages(session).at(-1)

  if (!last) {
    await ctx.answerCallbackQuery()
    return
  }

  last.status = "deleted"

  await ctx.answerCallbackQuery({
    text: ctx.t("callback-removed"),
  })

  await refreshBottomStatus(ctx, chatId(ctx))
}

async function handleUploadClear(ctx: CallbackQueryContext): Promise<void> {
  await ctx.answerCallbackQuery()

  await ctx.editMessageText(ctx.t("upload-clear-question"), {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: ctx.t("button-remove-all-confirm"),
            callback_data: "upload:clear_confirm",
          },
          {
            text: ctx.t("button-cancel"),
            callback_data: "upload:clear_cancel",
          },
        ],
      ],
    },
  })
}

async function handleUploadClearConfirm(
  ctx: CallbackQueryContext
): Promise<void> {
  const session = ctx.session.upload

  if (!session) {
    await ctx.answerCallbackQuery()
    return
  }

  for (const image of session.images) {
    image.status = "deleted"
  }

  session.viewerImageId = undefined

  await ctx.answerCallbackQuery()
  await ctx.editMessageText(ctx.t("upload-cleared"))
}

async function handleUploadClearCancel(
  ctx: CallbackQueryContext
): Promise<void> {
  const session = ctx.session.upload

  if (!session) {
    await ctx.answerCallbackQuery()
    return
  }

  await ctx.answerCallbackQuery()
  await ctx.editMessageText(renderUploadStatus(ctx, session), {
    reply_markup: {
      inline_keyboard: renderUploadKeyboard(ctx, session),
    },
  })
}

async function handleViewerNext(ctx: CallbackQueryContext): Promise<void> {
  const session = ctx.session.upload

  if (!session) {
    await ctx.answerCallbackQuery()
    return
  }

  selectNextViewerImage(session)

  await ctx.answerCallbackQuery()
  await refreshViewer(ctx, session)
}

async function handleViewerPrev(ctx: CallbackQueryContext): Promise<void> {
  const session = ctx.session.upload

  if (!session) {
    await ctx.answerCallbackQuery()
    return
  }

  selectPrevViewerImage(session)

  await ctx.answerCallbackQuery()
  await refreshViewer(ctx, session)
}

async function handleViewerDelete(ctx: CallbackQueryContext): Promise<void> {
  const session = ctx.session.upload

  if (!session) {
    await ctx.answerCallbackQuery()
    return
  }

  if (!deleteCurrentViewerImage(session)) {
    await ctx.answerCallbackQuery()
    return
  }

  await ctx.answerCallbackQuery({
    text: ctx.t("callback-removed"),
  })

  const id = chatId(ctx)
  const active = getActiveImages(session)

  if (active.length === 0) {
    if (session.viewerMessageId) {
      try {
        await ctx.api.editMessageCaption(id, session.viewerMessageId, {
          caption: ctx.t("upload-cleared-empty"),
          reply_markup: {
            inline_keyboard: renderViewerKeyboard(ctx, session),
          },
        })
      } catch {
        // ignore
      }
    }

    await refreshBottomStatus(ctx, id)
    return
  }

  await refreshViewer(ctx, session)
  await refreshBottomStatus(ctx, id)
}

async function handleViewerBack(ctx: CallbackQueryContext): Promise<void> {
  const session = ctx.session.upload

  if (!session) {
    await ctx.answerCallbackQuery()
    return
  }

  await ctx.answerCallbackQuery()
  await deleteMessageSafe(ctx, chatId(ctx), session.viewerMessageId)
  session.viewerMessageId = undefined
}

async function handleViewerBuild(ctx: CallbackQueryContext): Promise<void> {
  const session = ctx.session.upload

  if (!session) {
    await ctx.answerCallbackQuery()
    return
  }

  await ctx.answerCallbackQuery()

  const id = chatId(ctx)

  await deleteMessageSafe(ctx, id, session.viewerMessageId)
  session.viewerMessageId = undefined

  await refreshBottomStatus(ctx, id)

  if (!ctx.session.activeCompositionId) {
    await ctx.reply(ctx.t("upload-no-active-composition"))
    return
  }

  const { handleCommit } = await import("@/bot/handlers/commit")
  await handleCommit(ctx)
}

async function handleViewerNoop(ctx: CallbackQueryContext): Promise<void> {
  await ctx.answerCallbackQuery()
}

async function sendViewer(
  ctx: CallbackQueryContext,
  session: UploadSession
): Promise<void> {
  const image = getViewerImage(session)
  if (!image) return

  const active = getActiveImages(session)
  const index = getCurrentViewerIndex(session)
  const caption = renderViewerCaption(ctx, session, index, active.length)
  const keyboard = renderViewerKeyboard(ctx, session)
  const id = chatId(ctx)

  if (session.viewerMessageId) {
    try {
      await ctx.api.editMessageMedia(
        id,
        session.viewerMessageId,
        {
          type: "photo",
          media: image.fileId,
          caption,
        },
        {
          reply_markup: {
            inline_keyboard: keyboard,
          },
        }
      )
      return
    } catch {
      session.viewerMessageId = undefined
    }
  }

  try {
    const message = await ctx.api.sendPhoto(id, image.fileId, {
      caption,
      reply_markup: {
        inline_keyboard: keyboard,
      },
    })

    session.viewerMessageId = message.message_id
  } catch (error) {
    console.error("Failed to send viewer", { chatId: id, error })
  }
}

async function refreshViewer(
  ctx: CallbackQueryContext,
  session: UploadSession
): Promise<void> {
  await sendViewer(ctx, session)
}
