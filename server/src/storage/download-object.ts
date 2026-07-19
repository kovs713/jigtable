import { s3Client } from "./client"

interface DownloadObjectOptions {
  maxBytes: number
  timeoutMs: number
}

export async function downloadObject(
  objectKey: string,
  options: DownloadObjectOptions
): Promise<Buffer> {
  return readLimitedObject(objectKey, options.maxBytes, options.timeoutMs)
}

export function objectExists(objectKey: string): Promise<boolean> {
  return s3Client.exists(objectKey)
}

async function readLimitedObject(
  objectKey: string,
  maxBytes: number,
  timeoutMs: number
): Promise<Buffer> {
  const reader = s3Client.file(objectKey).stream().getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0
  const deadline = Date.now() + timeoutMs

  try {
    while (true) {
      const remainingMs = deadline - Date.now()

      if (remainingMs <= 0) {
        throw new Error("S3 object download timed out")
      }

      let timeout: ReturnType<typeof setTimeout> | undefined
      let result

      try {
        result = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(
              () => reject(new Error("S3 object download timed out")),
              remainingMs
            )
          }),
        ])
      } finally {
        clearTimeout(timeout)
      }

      const { done, value } = result

      if (done) {
        break
      }

      byteLength += value.byteLength

      if (byteLength > maxBytes) {
        throw new Error("S3 object exceeds size limit")
      }

      chunks.push(value)
    }
  } catch {
    await reader.cancel().catch(() => {})
    throw new Error("Failed to read S3 object")
  } finally {
    reader.releaseLock()
  }

  return Buffer.concat(chunks, byteLength)
}
