import { startApiServer } from "@/api"
import { createBot, startBot } from "@/bot"
import { closeRedis, connectRedis } from "@/services/redis"

async function main(): Promise<void> {
  await connectRedis()

  const api = startApiServer()

  const bot = await createBot()
  await startBot(bot)
}

void main().catch((error) => {
  closeRedis()
  console.error("Fatal startup error", error)
  process.exit(1)
})
