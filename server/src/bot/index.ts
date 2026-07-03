import { Bot, session, type Context } from "grammy"

import { registerHandlers } from "@/bot/handlers"
import { drizzleSessionStorage } from "@/bot/session-storage"
import type { BotContext, SessionData } from "@/bot/types"
import { readRequiredEnv } from "@/infra/env"

const getSessionKey = (ctx: Context): string | undefined =>
  ctx.chat?.id.toString()

const initialSession = (): SessionData => ({
  photos: [],
  isStarted: false,
  activeBatchId: undefined,
})

export async function createBot(): Promise<Bot<BotContext>> {
  const bot = new Bot<BotContext>(readRequiredEnv("BOT_TOKEN"))

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

export function startBot(bot: Bot<BotContext>): void {
  void bot.start().catch((error) => {
    console.error("Bot fatal error", error)
    process.exit(1)
  })
}
