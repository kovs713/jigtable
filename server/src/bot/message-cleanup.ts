import type { BotContext } from "@/bot/types"
import { deleteMessageSafe } from "@/bot/upload/status"

const TRANSIENT_COMMANDS = new Set([
  "start",
  "new",
  "reset",
  "status",
  "commit",
  "list",
  "help",
])

export function isTransientTextAction(ctx: BotContext): boolean {
  const text = ctx.message?.text
  if (!text) return false

  if (
    text === ctx.t("menu-new") ||
    text === ctx.t("menu-list") ||
    text === ctx.t("menu-help")
  ) {
    return true
  }

  const entity = ctx.message?.entities?.find(
    (candidate) => candidate.type === "bot_command" && candidate.offset === 0
  )

  if (!entity) return false

  const command = text.slice(1, entity.length).split("@")[0]
  return Boolean(command && TRANSIENT_COMMANDS.has(command))
}

export async function deleteIncomingMessage(ctx: BotContext): Promise<void> {
  if (!ctx.chat || !ctx.message) return

  await deleteMessageSafe(ctx, ctx.chat.id, ctx.message.message_id)
}
