import { InputFile } from "grammy"

import { LIMITS } from "@/config"
import { downloadObject } from "@/storage/download-object"

export async function downloadTelegramMedia(
  objectKey: string
): Promise<InputFile> {
  const bytes = await downloadObject(objectKey, {
    maxBytes: LIMITS.telegram.mediaMaxBytes,
    timeoutMs: LIMITS.telegram.mediaFetchTimeoutMs,
  })

  const filename = objectKey.split("/").at(-1) || "media"

  return new InputFile(bytes, filename)
}
