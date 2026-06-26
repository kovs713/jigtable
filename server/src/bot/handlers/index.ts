import type { Bot } from "grammy";

import { handleNew } from "./new";
import { handlePhoto } from "./photo";
import { handleReset } from "./reset";
import { handleStart } from "./start";
import { handleSticker } from "./sticker";
import type { BotContext } from "../types";

export async function registerHandlers(bot: Bot<BotContext>) {
  await bot.api.setMyCommands([
    { command: "start", description: "welкоме месаге" },
    { command: "new", description: "начать заполнять шлаком" },
    { command: "reset", description: "остановить подачу шлака" },
  ]);

  // commands
  bot.command("start", handleStart);
  bot.command("new", handleNew);
  bot.command("reset", handleReset);

  // fun
  bot.on("message:photo", handlePhoto);
  bot.on("message:sticker", handleSticker);
}
