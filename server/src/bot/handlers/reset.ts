import type { CommandContext } from "grammy";

import { deletePhoto } from "../../features/delete-photo";
import type { BotContext } from "../types";

export async function handleReset(ctx: CommandContext<BotContext>) {
  ctx.reply("command reset и че бля");
  ctx.session.isStarted = false;
  if (ctx.session.photos.length) {
    ctx.session.photos = [];
    for (const photo of ctx.session.photos) {
      await deletePhoto(photo);
    }
  }
}
