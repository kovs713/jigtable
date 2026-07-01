import { Bot, session, type Context } from "grammy"

import { registerHandlers } from "@/bot/handlers"
import { drizzleSessionStorage } from "@/bot/session-storage"
import type { BotContext, SessionData } from "@/bot/types"

const getSessionKey = (ctx: Context): string | undefined =>
  ctx.chat?.id.toString()

const initialSession = (): SessionData => ({
  photos: [],
  isStarted: false,
  activeBatchId: undefined,
})

export async function createBot(): Promise<Bot<BotContext>> {
  const bot = new Bot<BotContext>(process.env.BOT_TOKEN)

  bot.use(
    session({
      initial: initialSession,
      storage: drizzleSessionStorage<SessionData>(),
      getSessionKey,
    })
  )

  await registerHandlers(bot)

  bot.catch((err) => {
    console.error("Bot error", err)
  })

  return bot
}

export async function startBot(bot: Bot<BotContext>): Promise<void> {
  void bot.start()
}
