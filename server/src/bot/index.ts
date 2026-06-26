import { Bot, Context, session, type SessionFlavor } from "grammy";

import { drizzleSessionStorage } from "./session-storage";

interface SessionData {
  step?: number;
}

type BotContext = Context & SessionFlavor<SessionData>;

export const bot = new Bot<BotContext>(process.env.BOT_TOKEN);

const getSessionKey = (ctx: Context): string | undefined =>
  ctx.chat?.id.toString();

bot.use(
  session({
    initial: (): SessionData => ({}),
    storage: drizzleSessionStorage<SessionData>(),
    getSessionKey,
  }),
);
