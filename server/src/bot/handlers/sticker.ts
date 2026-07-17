import { COOL_STICKER_FILE_ID } from "@/bot/constants"
import type { StickerContext } from "@/bot/types"

export async function handleSticker(ctx: StickerContext): Promise<void> {
  await ctx.reply(ctx.t("sticker-reply"))
  await ctx.replyWithSticker(COOL_STICKER_FILE_ID)
}
