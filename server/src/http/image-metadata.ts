import sharp, { type Metadata } from "sharp"

import { LIMITS } from "@/config"
import { ApiError } from "./errors"

export async function readRemoteImageSize(
  imageUrl: string
): Promise<{ width: number; height: number }> {
  const url = new URL(imageUrl, process.env.CLIENT_URL)

  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(LIMITS.jigsaw.imageFetchTimeoutMs),
  })

  if (!response.ok) {
    throw new ApiError("Jigsaw image is not reachable", 400)
  }

  const contentLength = Number(response.headers.get("content-length"))

  if (
    Number.isFinite(contentLength) &&
    contentLength > LIMITS.jigsaw.maxImageBytes
  ) {
    throw new ApiError("Jigsaw image is too large", 400)
  }

  const buffer = Buffer.from(await response.arrayBuffer())

  if (buffer.byteLength > LIMITS.jigsaw.maxImageBytes) {
    throw new ApiError("Jigsaw image is too large", 400)
  }

  let metadata: Metadata

  try {
    metadata = await sharp(buffer).metadata()
  } catch {
    throw new ApiError("Jigsaw image is not readable", 400)
  }

  if (!metadata.width || !metadata.height) {
    throw new ApiError("Jigsaw image dimensions are not readable", 400)
  }

  return {
    width: metadata.width,
    height: metadata.height,
  }
}
