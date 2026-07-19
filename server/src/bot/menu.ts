import type { InlineKeyboardButton, ReplyKeyboardMarkup } from "grammy/types"

import type { BotContext, CallbackQueryContext } from "@/bot/types"
import {
  deleteMessageSafe,
  rememberFailedMessageDeletion,
} from "@/bot/upload/status"

export function mainMenuKeyboard(ctx: BotContext): ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: ctx.t("menu-new") }, { text: ctx.t("menu-list") }],
      [{ text: ctx.t("menu-help") }],
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: ctx.t("menu-placeholder"),
  }
}

export async function replyWithMainMenu(
  ctx: BotContext,
  text: string
): Promise<void> {
  await clearNavigationMessage(ctx)

  const message = await ctx.reply(text, {
    reply_markup: mainMenuKeyboard(ctx),
  })

  ctx.session.navigationMessageId = message.message_id
  ctx.session.mainMenuShown = true
}

export async function clearNavigationMessage(ctx: BotContext): Promise<void> {
  if (!ctx.chat) return

  const messageIds = new Set(ctx.session.staleMessageIds ?? [])
  if (ctx.session.navigationMessageId) {
    messageIds.add(ctx.session.navigationMessageId)
  }

  ctx.session.navigationMessageId = undefined
  ctx.session.staleMessageIds = []

  for (const messageId of messageIds) {
    if (!(await deleteMessageSafe(ctx, ctx.chat.id, messageId))) {
      rememberFailedMessageDeletion(ctx, messageId)
    }
  }
}

export function rememberNavigationMessage(
  ctx: BotContext,
  messageId: number
): void {
  ctx.session.navigationMessageId = messageId
}

export function claimNavigationCallback(ctx: CallbackQueryContext): boolean {
  const messageId = ctx.callbackQuery.message?.message_id
  if (!messageId) return false

  if (
    ctx.session.navigationMessageId &&
    ctx.session.navigationMessageId !== messageId
  ) {
    return false
  }

  ctx.session.navigationMessageId = messageId
  return true
}

export function inlineMenuKeyboard(ctx: BotContext): InlineKeyboardButton[][] {
  return [
    [
      { text: ctx.t("menu-new"), callback_data: "menu:new" },
      { text: ctx.t("menu-list"), callback_data: "menu:list" },
    ],
    [{ text: ctx.t("menu-help"), callback_data: "menu:help" }],
  ]
}

export async function replyWithInlineMenu(
  ctx: BotContext,
  text: string
): Promise<void> {
  await clearNavigationMessage(ctx)

  const message = await ctx.reply(text, {
    reply_markup: {
      inline_keyboard: inlineMenuKeyboard(ctx),
    },
  })

  rememberNavigationMessage(ctx, message.message_id)
}

export function nextActionsKeyboard(ctx: BotContext): InlineKeyboardButton[][] {
  return [
    [
      {
        text: ctx.t("menu-new"),
        callback_data: "menu:new",
      },
      {
        text: ctx.t("menu-list"),
        callback_data: "menu:list",
      },
    ],
  ]
}
