import {
  array,
  number,
  object,
  optional,
  record,
  string,
} from "@jigtable/shared"

import type { CollageLayout, LayoutItem } from "@/collage-layout-engine"
import { LIMITS } from "@/config"
import type { batchPhotosSchema } from "@/infra/db/schemas"
import { ApiError } from "../errors"
import { parseApiSchema } from "../utils/request"

export type PhotoRow = typeof batchPhotosSchema.$inferSelect

const LayoutSchema = object({
  canvas: object({
    width: number({ min: 1 }),
    height: number({ min: 1 }),
  }),
  items: array(
    object({
      id: string(),
      x: number(),
      y: number(),
      width: number({ min: 1 }),
      height: number({ min: 1 }),
      scale: optional(number({ min: 1 })),
      zIndex: optional(number()),
    })
  ),
})

export function normalizeLayout(
  raw: unknown,
  photos: PhotoRow[]
): CollageLayout {
  const value = parseApiSchema(LayoutSchema, unwrapLayout(raw), "layout")
  const photoById = new Map(photos.map((photo) => [photo.fileId, photo]))
  const canvas = value.canvas

  assertCanvasWithinLimits(canvas)

  if (value.items.length > LIMITS.layout.maxItems) {
    throw new ApiError(
      `items must contain at most ${LIMITS.layout.maxItems} entries`,
      400
    )
  }

  if (value.items.length > photos.length) {
    throw new ApiError("items cannot exceed source image count", 400)
  }

  const seenIds = new Set<string>()
  const items = value.items.map((rawItem, index): LayoutItem => {
    const id = rawItem.id
    const photo = photoById.get(id)

    if (!photo) {
      throw new ApiError(`Unknown image id ${id}`, 400)
    }

    if (seenIds.has(id)) {
      throw new ApiError(`Duplicate image id ${id}`, 400)
    }

    seenIds.add(id)

    const width = rawItem.width
    const height = rawItem.height

    assertItemWithinLimits(index, width, height)

    const x = rawItem.x
    const y = rawItem.y
    const zIndex = rawItem.zIndex ?? index
    const scale = rawItem.scale ?? 1

    if (
      x < 0 ||
      y < 0 ||
      x + width > canvas.width ||
      y + height > canvas.height
    ) {
      throw new ApiError(`items[${index}] is outside canvas`, 400)
    }

    return {
      id,
      src: photo.objectKey,
      x,
      y,
      width,
      height,
      scale,
      zIndex,
    }
  })

  return { canvas, items }
}

function assertCanvasWithinLimits(canvas: CollageLayout["canvas"]): void {
  if (canvas.width > LIMITS.layout.maxCanvasWidth) {
    throw new ApiError(
      `canvas.width must be at most ${LIMITS.layout.maxCanvasWidth}`,
      400
    )
  }

  if (canvas.height > LIMITS.layout.maxCanvasHeight) {
    throw new ApiError(
      `canvas.height must be at most ${LIMITS.layout.maxCanvasHeight}`,
      400
    )
  }

  if (canvas.width * canvas.height > LIMITS.layout.maxCanvasArea) {
    throw new ApiError(
      `canvas area must be at most ${LIMITS.layout.maxCanvasArea}`,
      400
    )
  }
}

function assertItemWithinLimits(
  index: number,
  width: number,
  height: number
): void {
  if (width > LIMITS.layout.maxItemWidth) {
    throw new ApiError(
      `items[${index}].width must be at most ${LIMITS.layout.maxItemWidth}`,
      400
    )
  }

  if (height > LIMITS.layout.maxItemHeight) {
    throw new ApiError(
      `items[${index}].height must be at most ${LIMITS.layout.maxItemHeight}`,
      400
    )
  }

  if (width * height > LIMITS.layout.maxItemArea) {
    throw new ApiError(
      `items[${index}] area must be at most ${LIMITS.layout.maxItemArea}`,
      400
    )
  }
}

export function unwrapLayout(raw: unknown): unknown {
  const value = record().parse(raw)

  if (value.ok && record().parse(value.value.layout).ok) {
    return value.value.layout
  }

  return raw
}
