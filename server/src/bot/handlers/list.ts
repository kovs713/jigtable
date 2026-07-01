import type { CommandContext } from "grammy"
import { desc, eq } from "drizzle-orm"

import type { BotContext } from "@/bot/types"
import { clientLayoutUrl } from "@/features/urls"
import { db } from "@/infra/db"
import { batchesSchema, PhotoBatchStatus } from "@/infra/db/shemas"

export async function handleList(
  ctx: CommandContext<BotContext>
): Promise<void> {
  if (!ctx.from) {
    await ctx.reply("не вижу юзера")
    return
  }

  const batches = await db
    .select()
    .from(batchesSchema)
    .where(eq(batchesSchema.userId, String(ctx.from.id)))
    .orderBy(desc(batchesSchema.createdAt))
    .limit(10)

  const readyBatches = batches.filter(
    (batch) =>
      batch.status === PhotoBatchStatus.Ready ||
      batch.status === PhotoBatchStatus.Completed
  )

  if (!readyBatches.length) {
    await ctx.reply("готовых сборок пока нет")
    return
  }

  await ctx.reply(
    readyBatches
      .map(
        (batch, index) =>
          `${index + 1}. ${batch.status}: ${clientLayoutUrl(batch.batchId, batch.editToken)}`
      )
      .join("\n")
  )
}
