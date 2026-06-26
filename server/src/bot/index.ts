import { Bot } from "grammy";

import type { BotContext } from "./types";

export const bot = new Bot<BotContext>(process.env.BOT_TOKEN);
