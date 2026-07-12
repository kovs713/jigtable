import { eq } from "drizzle-orm"
import type { CommandContext } from "grammy"

import type { BotContext } from "@/bot/types"
import { clearStatusPanel, deleteMessageSafe } from "@/bot/upload"
import { db } from "@/db"
import {
  CompositionStatus,
  compositionSourceImagesSchema,
  compositionsSchema,
} from "@/db/schemas"
import { s3Client } from "@/storage/client"

export async function handleReset(
  ctx: CommandContext<BotContext>
): Promise<void> {
  const session = ctx.session

  if (!session.upload && !session.activeCompositionId) {
    await ctx.reply(ctx.t("reset-nothing"))
    return
  }

  const chatId = ctx.chat?.id

  if (chatId) {
    await clearStatusPanel(ctx, chatId)
    await deleteMessageSafe(ctx, chatId, session.upload?.viewerMessageId)
  }

  if (session.activeCompositionId) {
    const photos = await db
      .select()
      .from(compositionSourceImagesSchema)
      .where(
        eq(
          compositionSourceImagesSchema.compositionId,
          session.activeCompositionId
        )
      )

    for (const photo of photos) {
      await s3Client.delete(photo.objectKey).catch(() => {})
    }

    await db
      .update(compositionsSchema)
      .set({ status: CompositionStatus.Canceled, updatedAt: new Date() })
      .where(eq(compositionsSchema.compositionId, session.activeCompositionId))
  }

  session.isStarted = false
  session.activeCompositionId = undefined
  session.photos = []
  session.upload = undefined

  await ctx.reply("Снёс. Можно кидать заново.")
}
