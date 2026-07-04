import { Bot, session, type Context } from "grammy"

import { isAdminTelegramUserId, isWhitelistedTelegramUserId } from "@/auth"
import { registerHandlers } from "@/bot/handlers"
import { drizzleSessionStorage } from "@/bot/session-storage"
import type { BotContext, SessionData } from "@/bot/types"
import { telegramWebhookSecret, telegramWebhookUrl } from "@/bot/webhook"
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
  bot.use(requireWhitelistedUser)

  registerHandlers(bot)

  bot.catch((err) => {
    console.error("Bot error", err)
  })

  return bot
}

async function requireWhitelistedUser(
  ctx: BotContext,
  next: () => Promise<void>
): Promise<void> {
  const command = readCommand(ctx)
  const userId = ctx.from?.id

  if (command === "whitelist") {
    if (userId && (await isAdminTelegramUserId(userId))) {
      await next()
    }

    return
  }

  if (!userId || !(await isWhitelistedTelegramUserId(userId))) {
    await ctx.reply("доступ только для whitelist")
    return
  }

  await next()
}

function readCommand(ctx: BotContext): string | null {
  const message = ctx.message
  const text = message && "text" in message ? message.text?.trim() : undefined

  if (!text?.startsWith("/")) {
    return null
  }

  return text.slice(1).split(/\s+/)[0]?.split("@")[0]?.toLowerCase() ?? null
}

export function startBot(bot: Bot<BotContext>): void {
  const webhookUrl = telegramWebhookUrl()

  void bot.api
    .setWebhook(webhookUrl, {
      secret_token: telegramWebhookSecret(),
    })
    .then(() => {
      console.log(`Bot webhook set to ${webhookUrl}`)
    })
    .catch((error) => {
      console.error("Bot fatal error", error)
      process.exit(1)
    })
}
