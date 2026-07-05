import { Bot, session, type ApiClientOptions, type Context } from "grammy"

import { isAdminTelegramUserId, isWhitelistedTelegramUserId } from "@/auth"
import { registerHandlers } from "@/bot/handlers"
import { telegramApiFetch } from "@/bot/proxy"
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
  const bot = new Bot<BotContext>(process.env.BOT_TOKEN, {
    client: {
      fetch: telegramApiFetch as unknown as ApiClientOptions["fetch"],
    },
  })

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
    } else {
      console.warn(`Bot whitelist command denied user=${userId ?? "-"}`)
    }

    return
  }

  if (!userId || !(await isWhitelistedTelegramUserId(userId))) {
    console.warn(
      `Bot update denied by whitelist user=${userId ?? "-"} command=${command ?? "-"}`
    )
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
  void bot.api
    .deleteWebhook({ drop_pending_updates: true })
    .then(() =>
      bot.start({
        onStart(botInfo) {
          console.log(`Bot polling started as @${botInfo.username}`)
        },
      })
    )
    .catch((error) => {
      console.error("Bot fatal error", error)
      process.exit(1)
    })
}
