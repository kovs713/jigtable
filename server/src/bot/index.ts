import { Bot, GrammyError, HttpError, session } from "grammy"

import { registerHandlers } from "@/bot/handlers"
import { telegramApiFetch } from "@/bot/proxy"
import { getBotSessionKey } from "@/bot/session-key"
import { drizzleSessionStorage } from "@/bot/session-storage"
import type { BotContext, SessionData } from "@/bot/types"
import { requireWhitelistedUser } from "./handlers/whitelist"
import { i18n } from "./i18n"

const initialSession = (): SessionData => ({
  photos: [],
  isStarted: false,
  activeCompositionId: undefined,
})

export async function createBot(): Promise<Bot<BotContext>> {
  const bot = new Bot<BotContext>(
    process.env.BOT_TOKEN,
    process.env.DEV
      ? {}
      : {
          client: {
            fetch: telegramApiFetch,
          },
        }
  )

  bot.use(
    session({
      initial: initialSession,
      storage: drizzleSessionStorage<SessionData>(),
      getSessionKey: getBotSessionKey,
    })
  )
  bot.use(i18n)
  bot.use(requireWhitelistedUser)

  await registerHandlers(bot)

  bot.catch(({ ctx, error }) => {
    const details: Record<string, unknown> = {
      updateId: ctx.update.update_id,
      error: error instanceof Error ? error.message : String(error),
    }

    if (error instanceof GrammyError) {
      details.method = error.method
      details.code = error.error_code
    } else if (error instanceof HttpError) {
      details.code = networkErrorCode(error.error)
    }

    console.error("Bot update failed", details)
  })

  return bot
}

function networkErrorCode(error: unknown): unknown {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined
  }

  return error.code
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
