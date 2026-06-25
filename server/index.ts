import { Bot, Context } from "grammy";
import type { Message, PhotoSize } from "grammy/types";

declare module "bun" {
  interface Env {
    BOT_TOKEN: string;
  }
}

const COOL_STICKER_FILE_ID =
  "CAACAgIAAxkBAAMGaj15VEVjJkj-ad3gjwjG1sv8OhQAAshMAAJ35mFI7mejcmcukIc8BA";
const bot = new Bot(process.env.BOT_TOKEN);

bot.on("message", async (ctx: Context) => {
  const message = ctx.message as Message;
  const userId = message.from?.id;

  // telegram send array of different photo sizes
  const photoArray: PhotoSize[] = message.photo ?? [];

  if (userId) {
    if (message.sticker) {
      await bot.api.sendMessage(userId, "мой стикер круче далбаеб");
      ctx.replyWithSticker(COOL_STICKER_FILE_ID);
    }

    if (photoArray) {
      const largest_photo = photoArray.at(-1) as PhotoSize;
      if (largest_photo) {
        // ctx.replyWithPhoto(largest_photo.file_id);
        await bot.api.sendPhoto(userId, largest_photo.file_id, {
          caption: "ну и говно",
        });
      } else {
        await bot.api.sendMessage(userId, "какая то хуйня бро");
      }
    }
  }
});

bot.start();
