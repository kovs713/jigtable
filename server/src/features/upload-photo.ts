import { LIMITS } from "@/config"
import { s3Client } from "@/infra/storage"
import { photoObjectKey } from "./photo-object-key"

export interface UploadedPhoto {
  objectKey: string
  contentType: string
}

export async function uploadPhoto(
  chatId: number,
  userId: number,
  fileUrl: string,
  fileId: string
): Promise<void> {
  await uploadPhotoToObjectKey(fileUrl, photoObjectKey(chatId, userId, fileId))
}

export async function uploadPhotoToObjectKey(
  fileUrl: string,
  objectKey: string
): Promise<UploadedPhoto> {
  const response = await fetch(fileUrl)
  const responseContentType = response.headers.get("content-type")

  if (!response.ok) {
    const errorBuffer = await readLimitedResponseBuffer(
      response,
      LIMITS.uploadPhotoBytes
    )

    console.warn("Telegram file download failed", {
      status: response.status,
      contentType: responseContentType ?? "-",
      bodyPreview: getSafeBodyPreview(errorBuffer),
    })

    throw new Error(`Failed to download an image: ${response.status}`)
  }

  const buffer = await readLimitedResponseBuffer(
    response,
    LIMITS.uploadPhotoBytes
  )
  const contentType = detectImageContentType(buffer)

  if (!contentType) {
    console.warn("Telegram file is not an image", {
      status: response.status,
      contentType: responseContentType ?? "-",
      bodyPreview: getSafeBodyPreview(buffer),
    })

    throw new Error("Telegram file is not an image")
  }

  await s3Client.write(objectKey, buffer, { type: contentType })

  return { objectKey, contentType }
}

function detectImageContentType(buffer: Buffer): string | undefined {
  if (isJpeg(buffer)) return "image/jpeg"
  if (isPng(buffer)) return "image/png"
  if (isWebp(buffer)) return "image/webp"
  if (isGif(buffer)) return "image/gif"
}

function isJpeg(buffer: Buffer): boolean {
  return (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  )
}

function isPng(buffer: Buffer): boolean {
  return (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  )
}

function isWebp(buffer: Buffer): boolean {
  return (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  )
}

function isGif(buffer: Buffer): boolean {
  if (buffer.length < 6) return false

  const signature = buffer.subarray(0, 6).toString("ascii")

  return signature === "GIF87a" || signature === "GIF89a"
}

function getSafeBodyPreview(buffer: Buffer): string {
  const token = process.env.BOT_TOKEN
  let preview = buffer
    .subarray(0, 200)
    .toString("utf8")
    .replace(/[^\x20-\x7e]+/g, " ")
    .trim()

  if (token) {
    preview = preview.split(token).join("[BOT_TOKEN]")
  }

  return preview
}

async function readLimitedResponseBuffer(
  response: Response,
  maxBytes: number
): Promise<Buffer> {
  const contentLength = response.headers.get("content-length")

  if (contentLength) {
    const bytes = Number(contentLength)

    if (!Number.isFinite(bytes) || bytes < 0) {
      throw new Error("Invalid Telegram file size")
    }

    if (bytes > maxBytes) {
      throw new Error("Telegram image is too large")
    }
  }

  if (!response.body) {
    return Buffer.from(await response.arrayBuffer())
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) break
      if (!value) continue

      totalBytes += value.byteLength

      if (totalBytes > maxBytes) {
        await reader.cancel()
        throw new Error("Telegram image is too large")
      }

      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  return Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk)),
    totalBytes
  )
}
