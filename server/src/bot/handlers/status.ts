import { InputFile } from "grammy"

import { COOL_IMAGE_S3_FILE_NAME } from "@/bot/constants"
import { replyWithMainMenu } from "@/bot/menu"
import type { BotContext } from "@/bot/types"
import { refreshBottomStatus } from "@/bot/upload"

let coolImageFileId: string | null = null

export async function handleStatus(ctx: BotContext): Promise<void> {
  if (!ctx.session.isStarted) {
    await replyWithMainMenu(ctx, ctx.t("status-not-started"))
    return
  }

  const upload = ctx.session.upload

  if (upload) {
    await refreshBottomStatus(ctx, ctx.chat!.id)
    return
  }

  if (ctx.session.photos.length > 0) {
    await ctx.reply(
      ctx.t("status-pictures", { count: ctx.session.photos.length })
    )
    return
  }

  await replyWithCoolPhoto(ctx)
}

async function replyWithCoolPhoto(ctx: BotContext): Promise<void> {
  if (coolImageFileId) {
    const message = await tryReplyWithCoolPhoto(ctx, coolImageFileId)

    if (!message) {
      coolImageFileId = null
      await ctx.reply(ctx.t("status-empty"))
    }

    return
  }

  const response = await fetch(COOL_IMAGE_S3_FILE_NAME)

  if (!response.ok || !response.body) {
    console.warn("Failed to fetch cool asset", {
      status: response.status,
    })

    await ctx.reply(ctx.t("status-empty"))
    return
  }

  const message = await tryReplyWithCoolPhoto(
    ctx,
    new InputFile(response.body, "cool_image.png")
  )

  if (!message) {
    await ctx.reply(ctx.t("status-empty"))
    return
  }

  coolImageFileId = message.photo.at(-1)?.file_id ?? null
}

async function tryReplyWithCoolPhoto(
  ctx: BotContext,
  photo: string | InputFile
) {
  try {
    return await ctx.replyWithPhoto(photo, {
      caption: ctx.t("status-empty"),
    })
  } catch (error) {
    console.warn("Failed to send cool status photo", error)
    return null
  }
}
