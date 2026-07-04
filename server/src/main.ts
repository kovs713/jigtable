import { startApiServer } from "@/api"
import { createBot, startBot } from "@/bot"
import { setupTelegramProxy } from "@/bot/proxy"

async function main(): Promise<void> {
  setupTelegramProxy()

  const bot = await createBot()

  startApiServer(bot)

  startBot(bot)
}

void main().catch((error) => {
  console.error("Fatal startup error", error)
  process.exit(1)
})
