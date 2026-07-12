import type { Bot } from "grammy"

import type { BotContext } from "@/bot/types"
import { registerUploadCallbacks } from "@/bot/upload"
import { handleCommit } from "./commit"
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
    { command: "start", description: "welcome message" }, // welcome мессаге
    { command: "new", description: "start feeding slag" }, // начать совать шлаком
    { command: "reset", description: "cancel feeding slag" }, // прервать подачу шлака
    { command: "commit", description: "commit slag feeding" }, // зафиксировать подачу шлака
    { command: "status", description: "check slag feeding status" }, // узнать статус подачи шлака
    { command: "list", description: "view your finished slag builds" }, // посмотреть свои готовые сборки шлака
  ])

  // commands
  bot.command("start", handleStart)
  bot.command("new", handleNew)
  bot.command("reset", handleReset)
  bot.command("status", handleStatus)
  bot.command("commit", handleCommit)
  bot.command("list", handleList)

  // admin commands
  bot.command("whitelist", handleWhitelist)

  // upload callbacks
  registerUploadCallbacks(bot)
  bot.callbackQuery(/^list:/, handleListAction)

  // service
  bot.on("message:photo", handlePhoto)

  // fun
  bot.on("message:sticker", handleSticker)
}
