import type { Bot } from "grammy"
import type { CallbackQueryContext, BotContext, UploadSession } from "@/bot/types"
import {
  getActiveImages,
  getCurrentViewerIndex,
  getViewerImage,
  deleteCurrentViewerImage,
  selectNextViewerImage,
  selectPrevViewerImage,
} from "./viewer"
import {
  renderViewerCaption,
  renderViewerKeyboard,
  renderUploadStatus,
  renderUploadKeyboard,
  deleteMessageSafe,
  getStatusMessageId,
  setStatusMessageId,
  clearStatusMessageId,
  getViewerMessageId,
  setViewerMessageId,
  clearViewerMessageId,
} from "./status"

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

function cid(ctx: CallbackQueryContext): number {
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
    await ctx.answerCallbackQuery({ text: "Смотреть пока нечего." })
    return
  }

  if (!session.viewerImageId) {
    const first = active[0]
    if (first) {
      session.viewerImageId = first.id
    }
  }

  await sendViewer(ctx, session)
  await ctx.answerCallbackQuery()
}

async function handleUploadBuild(ctx: CallbackQueryContext): Promise<void> {
  const session = ctx.session.upload
  if (!session) {
    await ctx.answerCallbackQuery()
    return
  }

  const active = getActiveImages(session)
  if (active.length < 2) {
    await ctx.answerCallbackQuery({ text: "Нужно хотя бы 2 картинки." })
    return
  }

  await ctx.answerCallbackQuery()
  await ctx.editMessageText(`Собираю из ${active.length} картинок.`)

  const chatId = cid(ctx)
  await deleteMessageSafe(ctx, chatId, getViewerMessageId(chatId))
  clearViewerMessageId(chatId)

  if (!ctx.session.activeBatchId) {
    await ctx.reply("Нет активного батча. Начни через /new")
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

  const active = getActiveImages(session)
  if (active.length === 0) {
    await ctx.answerCallbackQuery()
    return
  }

  const last = active[active.length - 1]
  if (!last) {
    await ctx.answerCallbackQuery()
    return
  }
  last.status = "deleted"

  await ctx.answerCallbackQuery({ text: "Удалил" })
  await refreshStatus(ctx, session)
}

async function handleUploadClear(ctx: CallbackQueryContext): Promise<void> {
  await ctx.answerCallbackQuery()
  await ctx.editMessageText("Точно снести весь набор?", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "да, снести", callback_data: "upload:clear_confirm" },
          { text: "не надо", callback_data: "upload:clear_cancel" },
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

  for (const img of session.images) {
    img.status = "deleted"
  }

  await ctx.answerCallbackQuery()
  await ctx.editMessageText("Снёс. Можно кидать заново.")

  const chatId = cid(ctx)
  await deleteMessageSafe(ctx, chatId, getStatusMessageId(chatId))
  clearStatusMessageId(chatId)
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
  const text = renderUploadStatus(session)
  const keyboard = renderUploadKeyboard(session)
  await ctx.editMessageText(text, {
    reply_markup: { inline_keyboard: keyboard },
  })
}

async function handleViewerNext(ctx: CallbackQueryContext): Promise<void> {
  const session = ctx.session.upload
  if (!session) {
    await ctx.answerCallbackQuery()
    return
  }

  selectNextViewerImage(session)
  await refreshViewer(ctx, session)
  await ctx.answerCallbackQuery()
}

async function handleViewerPrev(ctx: CallbackQueryContext): Promise<void> {
  const session = ctx.session.upload
  if (!session) {
    await ctx.answerCallbackQuery()
    return
  }

  selectPrevViewerImage(session)
  await refreshViewer(ctx, session)
  await ctx.answerCallbackQuery()
}

async function handleViewerDelete(ctx: CallbackQueryContext): Promise<void> {
  const session = ctx.session.upload
  if (!session) {
    await ctx.answerCallbackQuery()
    return
  }

  const deleted = deleteCurrentViewerImage(session)
  if (!deleted) {
    await ctx.answerCallbackQuery()
    return
  }

  await ctx.answerCallbackQuery({ text: "Удалил" })

  const chatId = cid(ctx)
  const active = getActiveImages(session)
  if (active.length === 0) {
    const viewerId = getViewerMessageId(chatId)
    if (viewerId) {
      try {
        await ctx.api.editMessageCaption(
          chatId,
          viewerId,
          { caption: "Всё удалил. Набор пустой." }
        )
      } catch {
        // ignore
      }
    }
    await refreshStatus(ctx, session)
    return
  }

  await refreshViewer(ctx, session)
  await refreshStatus(ctx, session)
}

async function handleViewerBack(ctx: CallbackQueryContext): Promise<void> {
  const chatId = cid(ctx)
  await deleteMessageSafe(ctx, chatId, getViewerMessageId(chatId))
  clearViewerMessageId(chatId)
  await ctx.answerCallbackQuery()
}

async function handleViewerBuild(ctx: CallbackQueryContext): Promise<void> {
  const session = ctx.session.upload
  if (!session) {
    await ctx.answerCallbackQuery()
    return
  }

  const active = getActiveImages(session)
  if (active.length < 2) {
    await ctx.answerCallbackQuery({ text: "Нужно хотя бы 2 картинки." })
    return
  }

  await ctx.answerCallbackQuery()
  const chatId = cid(ctx)
  await deleteMessageSafe(ctx, chatId, getViewerMessageId(chatId))
  clearViewerMessageId(chatId)

  await refreshStatus(ctx, session)

  if (!ctx.session.activeBatchId) {
    await ctx.reply("Нет активного батча. Начни через /new")
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
  const img = getViewerImage(session)
  if (!img) return

  const active = getActiveImages(session)
  const idx = getCurrentViewerIndex(session)
  const caption = renderViewerCaption(session, idx, active.length)
  const keyboard = renderViewerKeyboard(session)
  const chatId = cid(ctx)

  const existingId = getViewerMessageId(chatId)
  if (existingId) {
    try {
      await ctx.api.editMessageMedia(
        chatId,
        existingId,
        {
          type: "photo",
          media: img.fileId,
          caption,
          parse_mode: undefined,
        },
        { reply_markup: { inline_keyboard: keyboard } }
      )
      return
    } catch {
      // fallback: send new
    }
  }

  try {
    const msg = await ctx.api.sendPhoto(chatId, img.fileId, {
      caption,
      reply_markup: { inline_keyboard: keyboard },
    })
    setViewerMessageId(chatId, msg.message_id)
  } catch (error) {
    console.error("Failed to send viewer", error)
  }
}

async function refreshViewer(
  ctx: CallbackQueryContext,
  session: UploadSession
): Promise<void> {
  const img = getViewerImage(session)
  if (!img) return

  const active = getActiveImages(session)
  const idx = getCurrentViewerIndex(session)
  const caption = renderViewerCaption(session, idx, active.length)
  const keyboard = renderViewerKeyboard(session)
  const chatId = cid(ctx)

  const existingId = getViewerMessageId(chatId)
  if (existingId) {
    try {
      await ctx.api.editMessageMedia(
        chatId,
        existingId,
        {
          type: "photo",
          media: img.fileId,
          caption,
          parse_mode: undefined,
        },
        { reply_markup: { inline_keyboard: keyboard } }
      )
      return
    } catch {
      // fallback: send new
    }
  }

  try {
    const msg = await ctx.api.sendPhoto(chatId, img.fileId, {
      caption,
      reply_markup: { inline_keyboard: keyboard },
    })
    setViewerMessageId(chatId, msg.message_id)
  } catch (error) {
    console.error("Failed to refresh viewer", error)
  }
}

async function refreshStatus(
  ctx: CallbackQueryContext,
  session: UploadSession
): Promise<void> {
  const text = renderUploadStatus(session)
  const keyboard = renderUploadKeyboard(session)
  const chatId = cid(ctx)

  const oldId = getStatusMessageId(chatId)
  clearStatusMessageId(chatId)

  if (oldId) {
    await ctx.api.deleteMessage(chatId, oldId).catch((err) => {
      console.warn("deleteMessage failed", { chatId, messageId: oldId, err })
    })
  }

  try {
    const msg = await ctx.api.sendMessage(chatId, text, {
      reply_markup: { inline_keyboard: keyboard },
    })
    setStatusMessageId(chatId, msg.message_id)
  } catch (error) {
    console.error("Failed to send status panel", error)
  }
}
