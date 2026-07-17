import type { OverlayOptions } from "sharp"
import sharp from "sharp"

import type { CompositionLayout } from "@/native/composition-layout-engine"
import { s3Client } from "@/storage/client"

sharp.concurrency(1)

sharp.cache({
  memory: 32,
  files: 0,
  items: 20,
})

export type RenderFormat = "png" | "jpg" | "jpeg"

export const DEFAULT_RENDER_FORMAT: RenderFormat = "png"

export function resolveRenderFormat(
  value: unknown,
  fallback: RenderFormat = DEFAULT_RENDER_FORMAT
): RenderFormat {
  if (value === "png" || value === "jpg" || value === "jpeg") {
    return value
  }

  return fallback
}

export interface RenderPhotoSource {
  fileId: string
  objectKey: string
}

export interface RenderResult {
  buffer: Buffer
  contentType: "image/png" | "image/jpeg"
  format: RenderFormat
}

export interface RenderOptions {
  jpegQuality?: number
  jpegProgressive?: boolean
  pngCompressionLevel?: number
}

/**
 * global render queue inside current node.js-proccess.
 * processing only one renderLayoutInternal() in the same time.
 */
let renderQueue: Promise<void> = Promise.resolve()

function enqueueRender<T>(operation: () => Promise<T>): Promise<T> {
  const result = renderQueue.then(operation, operation)

  renderQueue = result.then(
    () => undefined,
    () => undefined
  )

  return result
}

/**
 * all function call requests stands in queue
 */
export function renderLayout(
  layout: CompositionLayout,
  photos: RenderPhotoSource[],
  format: RenderFormat,
  options: RenderOptions = {}
): Promise<RenderResult> {
  return enqueueRender(() =>
    renderLayoutInternal(layout, photos, format, options)
  )
}

async function renderLayoutInternal(
  layout: CompositionLayout,
  photos: RenderPhotoSource[],
  format: RenderFormat,
  options: RenderOptions
): Promise<RenderResult> {
  validateCanvas(layout)

  const sourceById = new Map(photos.map((photo) => [photo.fileId, photo]))

  const items = layout.items
    .map((item, originalIndex) => ({
      item,
      originalIndex,
    }))
    .sort(
      (first, second) =>
        (first.item.zIndex ?? first.originalIndex) -
          (second.item.zIndex ?? second.originalIndex) ||
        first.originalIndex - second.originalIndex
    )
    .map(({ item }) => item)

  const composites: OverlayOptions[] = []

  /*
   * WARN: due to weak cheap vps machine:
   * - loading image one by one;
   * - resize for each;
   * - without heavy Promise.all and parallel sharp-tasks.
   */
  for (const item of items) {
    const source = sourceById.get(item.id)

    if (!source) {
      throw new Error(`Missing source image for ${item.id}`)
    }

    const arrayBuffer = await s3Client.file(source.objectKey).arrayBuffer()

    const input = await sharp(Buffer.from(arrayBuffer), {
      failOn: "error",
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .resize(item.width, item.height, {
        fit: "fill",
        withoutEnlargement: false,
      })
      .toBuffer()

    composites.push({
      input,
      left: Math.round(item.x),
      top: Math.round(item.y),
    })
  }

  const image = sharp({
    create: {
      width: layout.canvas.width,
      height: layout.canvas.height,
      channels: 4,
      background: {
        r: 0,
        g: 0,
        b: 0,
        alpha: 0,
      },
    },
  }).composite(composites)

  if (format === "png") {
    const buffer = await image
      .png({
        compressionLevel: options.pngCompressionLevel ?? 6,
      })
      .toBuffer()

    return {
      buffer,
      contentType: "image/png",
      format,
    }
  }

  const buffer = await image
    .flatten({
      background: {
        r: 255,
        g: 255,
        b: 255,
      },
    })
    .jpeg({
      quality: options.jpegQuality ?? 92,
      progressive: options.jpegProgressive ?? true,
      mozjpeg: false,
    })
    .toBuffer()

  return {
    buffer,
    contentType: "image/jpeg",
    format,
  }
}

function validateCanvas(layout: CompositionLayout): void {
  const { width, height } = layout.canvas

  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error(`Invalid canvas size: ${width}x${height}`)
  }

  const maxCanvasPixels = 40_000_000

  if (width * height > maxCanvasPixels) {
    throw new Error(
      `Canvas is too large: ${width}x${height}. ` +
        `Maximum allowed area is ${maxCanvasPixels} pixels`
    )
  }

  for (const item of layout.items) {
    if (
      !Number.isFinite(item.x) ||
      !Number.isFinite(item.y) ||
      !Number.isInteger(item.width) ||
      !Number.isInteger(item.height) ||
      item.width <= 0 ||
      item.height <= 0
    ) {
      throw new Error(`Invalid layout item dimensions for ${item.id}`)
    }
  }
}
