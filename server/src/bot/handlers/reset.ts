import type { CommandContext } from "grammy"
import { eq } from "drizzle-orm"

import { s3Client } from "../../infra/storage"
import { db } from "../../infra/db"
import {
  batchPhotosSchema,
  batchesSchema,
  PhotoBatchStatus,
} from "../../infra/db/shemas"
import type { BotContext } from "../types"

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
