import { startApiServer } from "@/api"
import { createBot, startBot } from "@/bot"

async function main(): Promise<void> {
  const bot = await createBot()

  startBot(bot)

  startApiServer()
}

void main().catch((error) => {
  console.error("Fatal startup error", error)
  process.exit(1)
})
