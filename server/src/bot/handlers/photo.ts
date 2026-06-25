import type { Context, Filter } from "grammy";

import { uploadPhoto } from "../../features/upload-photo";

type PhotoContext = Filter<Context, "message:photo">;

export async function handlePhoto(ctx: PhotoContext) {
  // telegram send array of different photo sizes
  const photos = ctx.message.photo;

  const bestPhoto = photos.at(-1);
  if (!bestPhoto) return;

  const file = await ctx.api.getFile(bestPhoto.file_id);
  if (!file.file_path) {
    throw new Error("Telegram file path missing");
  }

  const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
  await uploadPhoto(fileUrl, bestPhoto.file_id);

  await ctx.replyWithPhoto(bestPhoto.file_id, {
    caption: "ну и говно",
  });
}
