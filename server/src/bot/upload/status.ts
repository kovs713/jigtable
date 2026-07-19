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

export function getCurrentStatusMessageId(
  chatId: number,
  session: UploadSession | undefined
): number | undefined {
  return statusPanels.get(chatId)?.messageId ?? session?.statusMessageId
}

export async function clearStatusPanel(
  ctx: BotContext,
  chatId: number
): Promise<void> {
  const state = statusPanels.get(chatId)
  const messageId = state?.messageId ?? ctx.session.upload?.statusMessageId

  statusPanels.delete(chatId)

  if (state?.timer) {
    clearTimeout(state.timer)
  }

  if (messageId) {
    if (!(await deleteMessageSafe(ctx, chatId, messageId))) {
      rememberFailedMessageDeletion(ctx, messageId)
    }
  }

  if (ctx.session.upload) {
    ctx.session.upload.statusMessageId = undefined
  }
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
  const compositionId = ctx.session.activeCompositionId

  return [
    [
      {
        text: ctx.t("button-view"),
        callback_data:
          hasImages && compositionId
            ? `upload:view:${compositionId}`
            : "viewer:noop",
      },
      {
        text: ctx.t("button-build"),
        callback_data:
          hasImages && compositionId
            ? `upload:build:${compositionId}`
            : "viewer:noop",
      },
    ],
    [
      {
        text: ctx.t("button-remove-latest"),
        callback_data:
          hasImages && compositionId
            ? `upload:delete_last:${compositionId}`
            : "viewer:noop",
      },
      {
        text: ctx.t("button-remove-all"),
        callback_data:
          hasImages && compositionId
            ? `upload:clear:${compositionId}`
            : "viewer:noop",
      },
    ],
    [
      {
        text: ctx.t("button-cancel-upload"),
        callback_data: compositionId
          ? `upload:cancel:${compositionId}`
          : "viewer:noop",
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
  const compositionId = ctx.session.activeCompositionId

  if (active.length === 0 || !compositionId) {
    return [
      [
        {
          text: ctx.t("button-close"),
          callback_data: compositionId
            ? `viewer:back:${compositionId}`
            : "viewer:noop",
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
        callback_data: isFirst ? "viewer:noop" : `viewer:prev:${compositionId}`,
      },
      {
        text: ctx.t("button-remove"),
        callback_data: `viewer:delete:${compositionId}`,
      },
      {
        text: isLast ? "·" : ctx.t("button-next"),
        callback_data: isLast ? "viewer:noop" : `viewer:next:${compositionId}`,
      },
    ],
    [
      {
        text: ctx.t("button-close"),
        callback_data: `viewer:back:${compositionId}`,
      },
      {
        text: ctx.t("button-build"),
        callback_data: `viewer:build:${compositionId}`,
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

      void refreshBottomStatus(ctx, chatId, state).catch((error) => {
        console.error("Failed to refresh status panel", { chatId, error })
      })
    }, delay)
  }

  schedule(LIMITS.telegram.statusRefreshDebounceMs)
}

export async function refreshBottomStatus(
  ctx: BotContext,
  chatId: number,
  expectedState?: StatusPanelRuntime
): Promise<void> {
  if (expectedState && statusPanels.get(chatId) !== expectedState) return

  const session = ctx.session.upload
  if (!session) return

  const state = getStatusPanel(chatId)
  const messageId = state.messageId ?? session.statusMessageId

  state.lastRefreshAt = Date.now()
  state.messageId = undefined
  session.statusMessageId = undefined

  if (messageId) {
    await deleteMessageSafe(ctx, chatId, messageId)
  }

  if (expectedState && statusPanels.get(chatId) !== expectedState) return

  let sentMessageId: number | undefined

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
    sentMessageId = message.message_id

    if (expectedState && statusPanels.get(chatId) !== expectedState) {
      await deleteMessageSafe(ctx, chatId, message.message_id)
      return
    }

    state.messageId = message.message_id
    session.statusMessageId = message.message_id
  } catch (error) {
    if (sentMessageId) {
      await deleteMessageSafe(ctx, chatId, sentMessageId)
    }
    console.error("Failed to send status panel", { chatId, error })
  }
}

export async function deleteMessageSafe(
  ctx: BotContext,
  chatId: number,
  messageId: number | undefined
): Promise<boolean> {
  if (!messageId) return true

  try {
    await ctx.api.deleteMessage(chatId, messageId)
    return true
  } catch (error) {
    if (isTerminalDeleteError(error)) return true

    rememberFailedMessageDeletion(ctx, messageId)
    return false
  }
}

function isTerminalDeleteError(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  const message = error.message.toLowerCase()

  return (
    message.includes("message to delete not found") ||
    message.includes("message can't be deleted") ||
    message.includes("message identifier is not specified") ||
    message.includes("bot was blocked by the user") ||
    message.includes("chat not found")
  )
}

export function rememberFailedMessageDeletion(
  ctx: BotContext,
  messageId: number
): void {
  const messageIds = new Set(ctx.session.staleMessageIds ?? [])
  messageIds.add(messageId)
  ctx.session.staleMessageIds = [...messageIds].slice(-20)
}
