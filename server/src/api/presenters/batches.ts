import type { CollageLayout } from "@/collage-layout-engine"
import { publicApiUrl } from "@/features/urls"
import type { batchesSchema } from "@/infra/db/schemas"

export interface ApiBatchLayout {
  batchId: string
  status: string | null
  layout: CollageLayout
  outputUrl: string | null
}

export function toApiBatchLayout(
  batch: typeof batchesSchema.$inferSelect,
  layout: CollageLayout
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
