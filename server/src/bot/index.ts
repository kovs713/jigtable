import { Bot, session, type Context } from "grammy"

import { registerHandlers } from "@/bot/handlers"
import { telegramApiFetch } from "@/bot/proxy"
import { drizzleSessionStorage } from "@/bot/session-storage"
import type { BotContext, SessionData } from "@/bot/types"
import { requireWhitelistedUser } from "./handlers/whitelist"
import { i18n } from "./i18n"

const getSessionKey = (ctx: Context): string | undefined =>
  ctx.chat?.id.toString()

const initialSession = (): SessionData => ({
  photos: [],
  isStarted: false,
  activeCompositionId: undefined,
})

export async function createBot(): Promise<Bot<BotContext>> {
  const bot = new Bot<BotContext>(
    process.env.BOT_TOKEN,
    process.env.DEV
      ? {
          client: {
            fetch: telegramApiFetch,
          },
        }
      : {}
  )

  bot.use(
    session({
      initial: initialSession,
      storage: drizzleSessionStorage<SessionData>(),
      getSessionKey,
    })
  )
  bot.use(i18n)
  bot.use(requireWhitelistedUser)

  await registerHandlers(bot)

  bot.catch((err) => {
    console.error("Bot error", err)
  })

  return bot
}

export async function startBot(bot: Bot<BotContext>): Promise<void> {
  await bot.api.deleteWebhook({
    drop_pending_updates: true,
  })

  await bot.start({
    onStart(botInfo) {
      console.log(`Bot polling started as @${botInfo.username}`)
    },
  })
}
