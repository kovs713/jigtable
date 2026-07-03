import { eq } from "drizzle-orm"
import type { CommandContext } from "grammy"

import type { BotContext } from "@/bot/types"
import { db } from "@/infra/db"
import {
  batchesSchema,
  batchPhotosSchema,
  PhotoBatchStatus,
} from "@/infra/db/schemas"
import { s3Client } from "@/infra/storage"

export async function handleReset(ctx: CommandContext<BotContext>) {
  await ctx.reply("command reset и че бля")

  if (!ctx.from) {
    await ctx.reply("ну и иди нахуй")
    return
  }

  if (ctx.session.activeBatchId) {
    const photos = await db
      .select()
      .from(batchPhotosSchema)
      .where(eq(batchPhotosSchema.batchId, ctx.session.activeBatchId))

    for (const photo of photos) {
      await s3Client.delete(photo.objectKey)
    }

    await db
      .update(batchesSchema)
      .set({ status: PhotoBatchStatus.Canceled, updatedAt: new Date() })
      .where(eq(batchesSchema.batchId, ctx.session.activeBatchId))
  }

  ctx.session.isStarted = false
  ctx.session.activeBatchId = undefined
  ctx.session.photos = []
}
