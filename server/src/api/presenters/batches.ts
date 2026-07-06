import { publicApiUrl } from "@/features/urls"
import type { batchesSchema } from "@/infra/db/schemas"
import type { ShuffleResult } from "@/shuffle"

export interface ApiBatchLayout {
  batchId: string
  status: string | null
  layout: ShuffleResult
  outputUrl: string | null
}

export function toApiBatchLayout(
  batch: typeof batchesSchema.$inferSelect,
  layout: ShuffleResult
): ApiBatchLayout {
  return {
    batchId: batch.batchId,
    status: batch.status,
    layout: {
      canvas: layout.canvas,
      items: layout.items.map((item) => ({
        ...item,
        src: imageUrl(batch.batchId, batch.editToken, item.id),
      })),
    },
    outputUrl: batch.outputKey
      ? renderedUrl(batch.batchId, batch.editToken)
      : null,
  }
}

export function imageUrl(
  batchId: string,
  token: string,
  fileId: string
): string {
  return `${publicApiUrl()}/api/batches/${batchId}/images/${encodeURIComponent(fileId)}?token=${encodeURIComponent(token)}`
}

export function renderedUrl(batchId: string, token: string): string {
  return `${publicApiUrl()}/api/batches/${batchId}/rendered?token=${encodeURIComponent(token)}`
}
