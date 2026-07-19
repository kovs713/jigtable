import type { Bot } from "grammy"

import type { BotContext } from "@/bot/types"
import {
  deleteIncomingMessage,
  isTransientTextAction,
} from "@/bot/message-cleanup"
import { claimNavigationCallback, replyWithInlineMenu } from "@/bot/menu"
import { registerUploadCallbacks } from "@/bot/upload"
import { handleCommit } from "./commit"
import { handleHelp } from "./help"
import { handleList, handleListAction } from "./list"
import { handleNew } from "./new"
import { handlePhoto } from "./photo"
import { handleReset } from "./reset"
import { handleStart } from "./start"
import { handleStatus } from "./status"
import { handleSticker } from "./sticker"
import { handleWhitelist } from "./whitelist"

export async function registerHandlers(bot: Bot<BotContext>) {
  await bot.api.setMyCommands([
    { command: "start", description: "open the main menu" },
    { command: "new", description: "create a composition" },
    { command: "status", description: "show the current upload" },
    { command: "list", description: "view your compositions" },
    { command: "help", description: "how it works" },
  ])

  await bot.api.setMyCommands(
    [
      { command: "start", description: "открыть главное меню" },
      { command: "new", description: "создать композицию" },
      { command: "status", description: "показать текущую загрузку" },
      { command: "list", description: "мои композиции" },
      { command: "help", description: "как это работает" },
    ],
    { language_code: "ru" }
  )

  bot.on("message:text", async (ctx, next) => {
    const shouldDelete = isTransientTextAction(ctx)

    try {
      await next()
    } finally {
      if (shouldDelete) await deleteIncomingMessage(ctx)
    }
  })

  // commands
  bot.command("start", handleStart)
  bot.command("new", handleNew)
  bot.command("reset", handleReset)
  bot.command("status", handleStatus)
  bot.command("commit", handleCommit)
  bot.command("list", handleList)
  bot.command("help", handleHelp)

  // admin commands
  bot.command("whitelist", handleWhitelist)

  // upload callbacks
  registerUploadCallbacks(bot)
  bot.callbackQuery(/^list:/, handleListAction)
  bot.callbackQuery("menu:new", async (ctx) => {
    if (!claimNavigationCallback(ctx)) {
      await ctx.answerCallbackQuery({ text: ctx.t("callback-outdated") })
      return
    }

    await ctx.answerCallbackQuery()
    await handleNew(ctx)
  })
  bot.callbackQuery("menu:list", async (ctx) => {
    if (!claimNavigationCallback(ctx)) {
      await ctx.answerCallbackQuery({ text: ctx.t("callback-outdated") })
      return
    }

    await ctx.answerCallbackQuery()
    await handleList(ctx)
  })
  bot.callbackQuery("menu:home", async (ctx) => {
    if (!claimNavigationCallback(ctx)) {
      await ctx.answerCallbackQuery({ text: ctx.t("callback-outdated") })
      return
    }

    await ctx.answerCallbackQuery()
    await replyWithInlineMenu(ctx, ctx.t("start-message"))
  })
  bot.callbackQuery("menu:help", async (ctx) => {
    if (!claimNavigationCallback(ctx)) {
      await ctx.answerCallbackQuery({ text: ctx.t("callback-outdated") })
      return
    }

    await ctx.answerCallbackQuery()
    await replyWithInlineMenu(ctx, ctx.t("help-message"))
  })
  bot.callbackQuery(/^menu:build:/, async (ctx) => {
    if (
      !claimNavigationCallback(ctx) ||
      ctx.callbackQuery.data.split(":").at(-1) !==
        ctx.session.activeCompositionId
    ) {
      await ctx.answerCallbackQuery({ text: ctx.t("callback-outdated") })
      return
    }

    await ctx.answerCallbackQuery()
    await handleCommit(ctx)
  })

  bot.on("message:text", async (ctx) => {
    if (ctx.message.text === ctx.t("menu-new")) {
      await handleNew(ctx)
      return
    }

    if (ctx.message.text === ctx.t("menu-list")) {
      await handleList(ctx)
      return
    }

    if (ctx.message.text === ctx.t("menu-help")) {
      await handleHelp(ctx)
    }
  })

  // service
  bot.on("message:photo", handlePhoto)

  // fun
  bot.on("message:sticker", handleSticker)
}
