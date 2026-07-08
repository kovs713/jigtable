import type { InlineKeyboardButton } from "grammy/types"

import type { BotContext, UploadSession } from "@/bot/types"
import { getActiveImages, getDeletedImages } from "./viewer"

const statusMessageIds = new Map<number, number>()
const viewerMessageIds = new Map<number, number>()

export function getStatusMessageId(chatId: number): number | undefined {
  return statusMessageIds.get(chatId)
}

export function setStatusMessageId(chatId: number, messageId: number): void {
  statusMessageIds.set(chatId, messageId)
}

export function clearStatusMessageId(chatId: number): void {
  statusMessageIds.delete(chatId)
}

export function getViewerMessageId(chatId: number): number | undefined {
  return viewerMessageIds.get(chatId)
}

export function setViewerMessageId(chatId: number, messageId: number): void {
  viewerMessageIds.set(chatId, messageId)
}

export function clearViewerMessageId(chatId: number): void {
  viewerMessageIds.delete(chatId)
}

export function renderUploadStatus(session: UploadSession): string {
  const active = getActiveImages(session)
  const deleted = getDeletedImages(session)

  if (active.length === 0 && deleted.length === 0) {
    return ["Смотреть пока нечего.", "Кинь сначала картинки."].join("\n")
  }

  // if (active.length < 2) {
  //   const lines: string[] = [`В наборе ${active.length} картинок.`]
  //   if (deleted.length > 0) {
  //     lines.push(`Удалено: ${deleted.length}.`)
  //   }
  //   if (session.duplicateCount > 0) {
  //     lines.push(`Повторов выкинул: ${session.duplicateCount}.`)
  //   }
  //   lines.push("")
  //   lines.push("Нужно хотя бы 2 картинки.")
  //   lines.push("Из одной пазл так себе, конечно.")
  //   return lines.join("\n")
  // }

  const lines: string[] = [`В наборе ${active.length} картинок.`]

  if (deleted.length > 0) {
    lines.push(`Удалено: ${deleted.length}.`)
  }
  if (session.duplicateCount > 0) {
    lines.push(`Повторов выкинул: ${session.duplicateCount}.`)
  }

  lines.push("")
  lines.push("Докидывай ещё или собираем.")

  return lines.join("\n")
}

export function renderUploadKeyboard(
  session: UploadSession
): InlineKeyboardButton[][] {
  const active = getActiveImages(session)
  const hasImages = active.length > 0
  // const canBuild = active.length > 0

  return [
    [
      {
        text: "глянуть",
        callback_data: hasImages ? "upload:view" : "viewer:noop",
      },
      {
        text: "собрать",
        callback_data: hasImages ? "upload:build" : "viewer:noop",
      },
    ],
    [
      {
        text: "убрать последнюю",
        callback_data: hasImages ? "upload:delete_last" : "viewer:noop",
      },
      {
        text: "снести всё",
        callback_data: hasImages ? "upload:clear" : "viewer:noop",
      },
    ],
  ]
}

export function renderViewerCaption(
  session: UploadSession,
  index: number,
  total: number
): string {
  const img = session.images.find((i) => i.id === session.viewerImageId)
  if (!img) return "Всё удалил. Набор пустой."
  return `${index + 1} из ${total}\n${img.width}×${img.height}`
}

export function renderViewerKeyboard(
  session: UploadSession
): InlineKeyboardButton[][] {
  const active = getActiveImages(session)
  if (active.length === 0) {
    return [[{ text: "закрыть", callback_data: "viewer:back" }]]
  }

  const idx = session.images.findIndex((i) => i.id === session.viewerImageId)
  const isFirst = idx <= 0
  const isLast = idx >= active.length - 1

  return [
    [
      {
        text: isFirst ? "·" : "назад",
        callback_data: isFirst ? "viewer:noop" : "viewer:prev",
      },
      { text: "удалить", callback_data: "viewer:delete" },
      {
        text: isLast ? "·" : "дальше",
        callback_data: isLast ? "viewer:noop" : "viewer:next",
      },
    ],
    [
      { text: "закрыть", callback_data: "viewer:back" },
      {
        text: "собрать",
        callback_data: active.length >= 2 ? "viewer:build" : "viewer:noop",
      },
    ],
  ]
}

const STATUS_REFRESH_DEBOUNCE_MS = 1200
const STATUS_REFRESH_THROTTLE_MS = 2500

export function scheduleUploadStatusRefresh(ctx: BotContext): void {
  const session = ctx.session.upload
  if (!session) return
  const chatId = ctx.chat?.id
  if (!chatId) return

  if (session.statusRefreshTimer) {
    clearTimeout(session.statusRefreshTimer)
  }

  session.statusRefreshTimer = setTimeout(() => {
    session.statusRefreshTimer = undefined
    const now = Date.now()
    if (
      session.lastStatusRefreshAt &&
      now - session.lastStatusRefreshAt < STATUS_REFRESH_THROTTLE_MS
    ) {
      const delay =
        STATUS_REFRESH_THROTTLE_MS - (now - session.lastStatusRefreshAt)
      session.statusRefreshTimer = setTimeout(() => {
        session.statusRefreshTimer = undefined
        void refreshBottomStatus(ctx, chatId)
      }, delay)
      return
    }
    void refreshBottomStatus(ctx, chatId)
  }, STATUS_REFRESH_DEBOUNCE_MS)
}

export async function refreshBottomStatus(
  ctx: BotContext,
  chatId: number
): Promise<void> {
  const session = ctx.session.upload
  if (!session) return

  const text = renderUploadStatus(session)
  const keyboard = renderUploadKeyboard(session)
  session.lastStatusRefreshAt = Date.now()

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

export async function deleteMessageSafe(
  ctx: BotContext,
  chatId: number,
  messageId: number | undefined
): Promise<void> {
  if (!messageId) return
  try {
    await ctx.api.deleteMessage(chatId, messageId)
  } catch {
    // ignore
  }
}
