import type { Bot } from "grammy"

import type { BotContext } from "@/bot/types"
import { handleCommit } from "./commit"
import { handleList } from "./list"
import { handleNew } from "./new"
import { handlePhoto } from "./photo"
import { handleReset } from "./reset"
import { handleStart } from "./start"
import { handleStatus } from "./status"
import { handleSticker } from "./sticker"
import { handleWhitelist } from "./whitelist"

export async function registerHandlers(bot: Bot<BotContext>) {
  await bot.api.setMyCommands([
    { command: "start", description: "welкоме месаге" },
    { command: "new", description: "начать совать шлаком" },
    { command: "reset", description: "прервать подачу шлака" },
    { command: "commit", description: "подтвердить подачу шлака" },
    { command: "status", description: "узнать статус подачи шлака" },
    { command: "list", description: "посмотреть свои готовые сборки шлака" },
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

  // service
  bot.on("message:photo", handlePhoto)

  // fun
  bot.on("message:sticker", handleSticker)
}
