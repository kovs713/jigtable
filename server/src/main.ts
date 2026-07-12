import { startApiServer } from "@/api"
import { createBot, startBot } from "@/bot"

async function main(): Promise<void> {
  const bot = await createBot()

  startApiServer()

  await startBot(bot)
}

void main().catch((error) => {
  console.error("Fatal startup error", error)
  process.exit(1)
})
