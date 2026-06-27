import { uploadPhoto } from "../../features/upload-photo";
import type { PhotoContext } from "../types";

export async function handlePhoto(ctx: PhotoContext) {
  const photos = ctx.message.photo;

  if (ctx.session.isStarted) {
    const bestPhoto = photos.at(-1);
    if (!bestPhoto) return;

    const file = await ctx.api.getFile(bestPhoto.file_id);
    if (!file.file_path) {
      throw new Error("Telegram file path missing");
    }

    ctx.session.photos.push(bestPhoto.file_id);

    const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
    await uploadPhoto(ctx.chat.id, ctx.from.id, fileUrl, bestPhoto.file_id);
  } else {
    await ctx.reply("бля всему учить нада, далбаеб сначала /new нажми");
  }
}
