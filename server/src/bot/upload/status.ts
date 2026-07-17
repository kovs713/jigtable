import type { InlineKeyboardButton } from "grammy/types"

import type { BotContext, UploadSession } from "@/bot/types"
import { LIMITS } from "@/config"
import {
  getActiveImages,
  getCurrentViewerIndex,
  getDeletedImages,
  getViewerImage,
} from "./viewer"

interface StatusPanelRuntime {
  messageId?: number
  timer?: ReturnType<typeof setTimeout>
  lastRefreshAt?: number
}

const statusPanels = new Map<number, StatusPanelRuntime>()

function getStatusPanel(chatId: number): StatusPanelRuntime {
  const current = statusPanels.get(chatId)
  if (current) return current

  const created: StatusPanelRuntime = {}
  statusPanels.set(chatId, created)
  return created
}

export function rememberStatusMessage(chatId: number, messageId: number): void {
  getStatusPanel(chatId).messageId = messageId
}

export async function clearStatusPanel(
  ctx: BotContext,
  chatId: number
): Promise<void> {
  const state = statusPanels.get(chatId)

  if (state?.timer) {
    clearTimeout(state.timer)
  }

  if (state?.messageId) {
    await deleteMessageSafe(ctx, chatId, state.messageId)
  }

  statusPanels.delete(chatId)
}

export function renderUploadStatus(
  ctx: BotContext,
  session: UploadSession
): string {
  const active = getActiveImages(session)
  const deleted = getDeletedImages(session)

  if (active.length === 0 && deleted.length === 0) {
    return ctx.t("upload-status-empty")
  }

  const lines: string[] = [
    ctx.t("upload-status-pictures", { count: active.length }),
  ]

  if (deleted.length > 0) {
    lines.push(ctx.t("upload-status-deleted", { count: deleted.length }))
  }

  if (session.duplicateCount > 0) {
    lines.push(
      ctx.t("upload-status-duplicates", {
        count: session.duplicateCount,
      })
    )
  }

  lines.push("")
  lines.push(ctx.t("upload-status-continue"))

  return lines.join("\n")
}

export function renderUploadKeyboard(
  ctx: BotContext,
  session: UploadSession
): InlineKeyboardButton[][] {
  const hasImages = getActiveImages(session).length > 0

  return [
    [
      {
        text: ctx.t("button-view"),
        callback_data: hasImages ? "upload:view" : "viewer:noop",
      },
      {
        text: ctx.t("button-build"),
        callback_data: hasImages ? "upload:build" : "viewer:noop",
      },
    ],
    [
      {
        text: ctx.t("button-remove-latest"),
        callback_data: hasImages ? "upload:delete_last" : "viewer:noop",
      },
      {
        text: ctx.t("button-remove-all"),
        callback_data: hasImages ? "upload:clear" : "viewer:noop",
      },
    ],
  ]
}

export function renderViewerCaption(
  ctx: BotContext,
  session: UploadSession,
  index: number,
  total: number
): string {
  const image = getViewerImage(session)

  if (!image) {
    return ctx.t("viewer-empty")
  }

  return ctx.t("viewer-caption", {
    current: index + 1,
    total,
    width: image.width,
    height: image.height,
  })
}

export function renderViewerKeyboard(
  ctx: BotContext,
  session: UploadSession
): InlineKeyboardButton[][] {
  const active = getActiveImages(session)

  if (active.length === 0) {
    return [
      [
        {
          text: ctx.t("button-close"),
          callback_data: "viewer:back",
        },
      ],
    ]
  }

  const index = getCurrentViewerIndex(session)
  const isFirst = index <= 0
  const isLast = index >= active.length - 1

  return [
    [
      {
        text: isFirst ? "·" : ctx.t("button-back"),
        callback_data: isFirst ? "viewer:noop" : "viewer:prev",
      },
      {
        text: ctx.t("button-remove"),
        callback_data: "viewer:delete",
      },
      {
        text: isLast ? "·" : ctx.t("button-next"),
        callback_data: isLast ? "viewer:noop" : "viewer:next",
      },
    ],
    [
      {
        text: ctx.t("button-close"),
        callback_data: "viewer:back",
      },
      {
        text: ctx.t("button-build"),
        callback_data: "viewer:build",
      },
    ],
  ]
}

export function scheduleUploadStatusRefresh(ctx: BotContext): void {
  const session = ctx.session.upload
  const chatId = ctx.chat?.id

  if (!session || !chatId) return

  const state = getStatusPanel(chatId)

  if (state.timer) {
    clearTimeout(state.timer)
  }

  const schedule = (delay: number): void => {
    state.timer = setTimeout(() => {
      state.timer = undefined

      if (!ctx.session.upload) return

      const now = Date.now()
      const elapsed = state.lastRefreshAt
        ? now - state.lastRefreshAt
        : Number.POSITIVE_INFINITY

      if (elapsed < LIMITS.telegram.statusRefrechThrottleMs) {
        schedule(LIMITS.telegram.statusRefrechThrottleMs - elapsed)
        return
      }

      void refreshBottomStatus(ctx, chatId).catch((error) => {
        console.error("Failed to refresh status panel", { chatId, error })
      })
    }, delay)
  }

  schedule(LIMITS.telegram.statusRefreshDebounceMs)
}

export async function refreshBottomStatus(
  ctx: BotContext,
  chatId: number
): Promise<void> {
  const session = ctx.session.upload
  if (!session) return

  const state = getStatusPanel(chatId)
  const oldMessageId = state.messageId

  state.lastRefreshAt = Date.now()
  state.messageId = undefined

  if (oldMessageId) {
    await deleteMessageSafe(ctx, chatId, oldMessageId)
  }

  try {
    const message = await ctx.api.sendMessage(
      chatId,
      renderUploadStatus(ctx, session),
      {
        reply_markup: {
          inline_keyboard: renderUploadKeyboard(ctx, session),
        },
      }
    )

    state.messageId = message.message_id
  } catch (error) {
    console.error("Failed to send status panel", { chatId, error })
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
