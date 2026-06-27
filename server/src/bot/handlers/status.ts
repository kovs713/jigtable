import { InputFile, type CommandContext } from "grammy";

import { COOL_IMAGE_S3_URL } from "../constants";
import type { BotContext } from "../types";

let coolImageFileId: string | null = null;

async function replyWithCoolPhoto(
  ctx: CommandContext<BotContext>,
): Promise<void> {
  if (coolImageFileId) {
    await ctx.replyWithPhoto(coolImageFileId, {
      caption: "ничего не засовано",
    });
  }

  const response = await fetch(COOL_IMAGE_S3_URL);
  if (!response.ok || !response.body) {
    throw new Error(`failed to fetch cool asset: ${response.status}`);
  }

  const message = await ctx.replyWithPhoto(
    new InputFile(response.body, "cool_image.png"),
    {
      caption: "ничего не засовано",
    },
  );

  coolImageFileId = message.photo.at(-1)?.file_id ?? null;
}

export async function handleStatus(
  ctx: CommandContext<BotContext>,
): Promise<void> {
  if (!ctx.session.isStarted) {
    await ctx.reply(
      "ничего не начато ебаклак, нажми /new чтобы начать свой шлак кидать",
    );
    return;
  }

  const photos = ctx.session.photos;
  if (photos.length) {
    await ctx.reply(`сейчас в меня засовано ${photos.length} шлака`);
    return;
  }

  await replyWithCoolPhoto(ctx);
}
