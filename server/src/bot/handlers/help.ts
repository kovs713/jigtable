import type { BotContext } from "@/bot/types"
import { replyWithMainMenu } from "@/bot/menu"

export async function handleHelp(ctx: BotContext): Promise<void> {
  await replyWithMainMenu(ctx, ctx.t("help-message"))
}
