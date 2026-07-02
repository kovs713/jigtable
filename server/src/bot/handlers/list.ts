import type { CommandContext } from "grammy"
import { and, desc, eq, or } from "drizzle-orm"

import type { BotContext } from "@/bot/types"
import { clientLayoutUrl } from "@/features/urls"
import { db } from "@/infra/db"
import { batchesSchema, PhotoBatchStatus } from "@/infra/db/schemas"

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
    .where(
      and(
        eq(batchesSchema.userId, String(ctx.from.id)),
        or(
          eq(batchesSchema.status, PhotoBatchStatus.Ready),
          eq(batchesSchema.status, PhotoBatchStatus.Completed)
        )
      )
    )
    .orderBy(desc(batchesSchema.createdAt))
    .limit(10)

  if (!batches.length) {
    await ctx.reply("готовых сборок пока нет")
    return
  }

  await ctx.reply(
    batches
      .map(
        (batch, index) =>
          `${index + 1}. ${batch.status}: ${clientLayoutUrl(batch.batchId, batch.editToken)}`
      )
      .join("\n")
  )
}
