import { Context, session } from "grammy";

import { bot } from "./bot";
import { registerHandlers } from "./bot/handlers";
import { drizzleSessionStorage } from "./bot/session-storage";
import type { SessionData } from "./bot/types";

const getSessionKey = (ctx: Context): string | undefined =>
  ctx.chat?.id.toString();

bot.use(
  session({
    initial: (): SessionData => ({}),
    storage: drizzleSessionStorage<SessionData>(),
    getSessionKey,
  }),
);

await registerHandlers(bot);

bot.catch((err) => {
  console.error("Bot error", err);
});

bot.start();
