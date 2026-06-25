import type { Bot } from "grammy";

import { handlePhoto } from "./photo";
import { handleSticker } from "./sticker";

export function registerHandlers(bot: Bot) {
  bot.on("message:photo", handlePhoto);
  bot.on("message:sticker", handleSticker);
}
