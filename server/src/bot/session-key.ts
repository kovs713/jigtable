import type { Context } from "grammy"

export function getBotSessionKey(ctx: Context): string | undefined {
  return ctx.chat?.id.toString()
}
