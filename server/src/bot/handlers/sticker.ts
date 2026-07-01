import { COOL_STICKER_FILE_ID } from "@/bot/constants"
import type { StickerContext } from "@/bot/types"

export async function handleSticker(ctx: StickerContext) {
  await ctx.reply("мой стикер круче далбаеб")
  await ctx.replyWithSticker(COOL_STICKER_FILE_ID)
}
