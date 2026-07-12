import { InputFile, type CommandContext } from "grammy"

import { COOL_IMAGE_S3_FILE_NAME } from "@/bot/constants"
import type { BotContext } from "@/bot/types"
import { getActiveImages } from "@/bot/upload"

let coolImageFileId: string | null = null

export async function handleStatus(
  ctx: CommandContext<BotContext>
): Promise<void> {
  if (!ctx.session.isStarted) {
    await ctx.reply("Ничего не начато. Нажми /new чтобы начать.")
    return
  }

  const upload = ctx.session.upload

  if (upload) {
    const active = getActiveImages(upload)

    if (active.length === 0) {
      await ctx.reply("Набор пустой. Кинь картинки через /new.")
      return
    }
    await ctx.reply(`В наборе ${active.length} картинок.`)
    return
  }

  const photos = ctx.session.photos
  if (photos.length) {
    await ctx.reply(`В наборе ${photos.length} картинок.`)
    return
  }

  await replyWithCoolPhoto(ctx)
}

async function replyWithCoolPhoto(
  ctx: CommandContext<BotContext>
): Promise<void> {
  if (coolImageFileId) {
    const message = await tryReplyWithCoolPhoto(ctx, coolImageFileId)

    if (!message) {
      coolImageFileId = null
      await ctx.reply("Набор пустой.")
    }

    return
  }

  const response = await fetch(COOL_IMAGE_S3_FILE_NAME)

  if (!response.ok || !response.body) {
    console.warn(
      `ERROR: Failed to fetch cool asset with status ${response.status}`
    )
    await ctx.reply("Набор пустой.")
    return
  }

  const message = await tryReplyWithCoolPhoto(
    ctx,
    new InputFile(response.body, "cool_image.png")
  )

  if (!message) {
    await ctx.reply("Набор пустой.")
    return
  }

  coolImageFileId = message.photo.at(-1)?.file_id ?? null
}

async function tryReplyWithCoolPhoto(
  ctx: CommandContext<BotContext>,
  photo: string | InputFile
) {
  try {
    return await ctx.replyWithPhoto(photo, {
      caption: "Набор пустой.",
    })
  } catch (error) {
    console.warn("Failed to send cool status photo", error)
    return null
  }
}
