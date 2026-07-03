import { InputFile, type CommandContext } from "grammy"

import { COOL_IMAGE_S3_FILE_NAME } from "@/bot/constants"
import type { BotContext } from "@/bot/types"

let coolImageFileId: string | null = null

export async function handleStatus(
  ctx: CommandContext<BotContext>
): Promise<void> {
  // Session not started
  if (!ctx.session.isStarted) {
    await ctx.reply(
      "ничего не начато ебаклак, нажми /new чтобы начать свой шлак кидать"
    )
    return
  }

  const photos = ctx.session.photos

  // Else if started and images pushed tell how much
  if (photos.length) {
    await ctx.reply(
      `batch ${ctx.session.activeBatchId}: сейчас в меня засовано ${photos.length} шлака`
    )
    return
  }

  // If not pushed
  await replyWithCoolPhoto(ctx)
}

async function replyWithCoolPhoto(
  ctx: CommandContext<BotContext>
): Promise<void> {
  if (coolImageFileId) {
    await ctx.replyWithPhoto(coolImageFileId, {
      caption: "ничего не засовано",
    })
    return
  }

  const response = await fetch(COOL_IMAGE_S3_FILE_NAME)
  if (!response.ok || !response.body) {
    console.warn(
      `ERROR: Failed to fetch cool asset with status ${response.status}`
    )
    await ctx.reply("ничего не засовано")
    return
  }

  const message = await ctx.replyWithPhoto(
    new InputFile(response.body, "cool_image.png"),
    {
      caption: "ничего не засовано",
    }
  )

  coolImageFileId = message.photo.at(-1)?.file_id ?? null
}
