import type { BotContext } from "@/bot/types"
import { replyWithMainMenu } from "@/bot/menu"

export async function handleStart(ctx: BotContext): Promise<void> {
  await replyWithMainMenu(ctx, ctx.t("start-message"))
}
