import { startApiServer } from "@/api"
import { createBot, startBot } from "@/bot"

async function main(): Promise<void> {
  const api = startApiServer()

  const bot = await createBot()
  await startBot(bot)
}

void main().catch((error) => {
  console.error("Fatal startup error", error)
  process.exit(1)
})
