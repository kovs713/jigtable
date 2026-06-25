import { Bot, Context } from "grammy";
import type { Message, PhotoSize } from "grammy/types";
import { s3_client } from "./s3";

const COOL_STICKER_FILE_ID =
  "CAACAgIAAxkBAAMGaj15VEVjJkj-ad3gjwjG1sv8OhQAAshMAAJ35mFI7mejcmcukIc8BA";
const bot = new Bot(process.env.BOT_TOKEN);

bot.on("message", async (ctx: Context) => {
  const message = ctx.message as Message;
  const userId = message.from?.id;
  if (!userId) return;

  // telegram send array of different photo sizes
  const photoArray = message.photo;
  if (photoArray) {
    const best_photo = photoArray.at(-1) as PhotoSize;
    if (best_photo) {
      const file = await ctx.api.getFile(best_photo.file_id);

      const file_url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
      const response = await fetch(file_url);
      if (response.ok || response.body) {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        await s3_client.write(`test/говно-${best_photo.file_id}`, buffer);
      }

      await bot.api.sendPhoto(userId, best_photo.file_id, {
        caption: "ну и говно",
      });
    } else {
      await bot.api.sendMessage(userId, "какая то хуйня бро");
    }
  }

  if (message.sticker) {
    await bot.api.sendMessage(userId, "мой стикер круче далбаеб");
    ctx.replyWithSticker(COOL_STICKER_FILE_ID);
  }
});

bot.start();
