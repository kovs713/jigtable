import { startApiServer } from "@/api"
import { createBot, startBot } from "@/bot"

async function main(): Promise<void> {
  const bot = await createBot()

  await startBot(bot)

  startApiServer()
}

void main()
