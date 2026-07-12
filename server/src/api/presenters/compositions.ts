import type { compositionsSchema } from "@/db/schemas"
import type { CompositionLayout } from "@/native/composition-layout-engine"

export interface ApiCompositionLayout {
  compositionId: string
  status: string | null
  layout: CompositionLayout
  jigsawImageUrl: string | null
}

export function toApiCompositionLayout(
  composition: typeof compositionsSchema.$inferSelect,
  layout: CompositionLayout
): ApiCompositionLayout {
  return {
    compositionId: composition.compositionId,
    status: composition.status,
    layout: {
      canvas: layout.canvas,
      items: layout.items.map((item) => ({
        ...item,
        src: sourceImageUrl(
          composition.compositionId,
          composition.editToken,
          item.id
        ),
      })),
    },
    jigsawImageUrl: composition.jigsawImageKey
      ? jigsawImageUrl(composition.compositionId, composition.editToken)
      : null,
  }
}

export function sourceImageUrl(
  compositionId: string,
  token: string,
  fileId: string
): string {
  return `${process.env.PUBLIC_API_URL}/api/compositions/${compositionId}/images/${encodeURIComponent(fileId)}?token=${encodeURIComponent(token)}`
}

export function jigsawImageUrl(compositionId: string, token: string): string {
  return `${process.env.PUBLIC_API_URL}/api/compositions/${compositionId}/rendered?token=${encodeURIComponent(token)}`
}
