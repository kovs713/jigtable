import type { Context, Filter } from "grammy";

import { COOL_STICKER_FILE_ID } from "../constants";

type StickerContext = Filter<Context, "message:sticker">;

export async function handleSticker(ctx: StickerContext) {
  await ctx.reply("мой стикер круче далбаеб");
  await ctx.replyWithSticker(COOL_STICKER_FILE_ID);
}
