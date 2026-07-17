import type { RenderFormat } from "@/native/render-layout"

export function compositionSourceImageObjectKey(
  compositionId: string,
  fileId: string
): string {
  return `compositions/${compositionId}/photos/${encodeURIComponent(fileId)}`
}

export function photoObjectKey(
  chatId: number,
  userId: number,
  fileId: string
): string {
  return `photos/${chatId}/${userId}__${encodeURIComponent(fileId)}`
}

export function telegramPreviewObjectKey(compositionId: string): string {
  return `compositions/${compositionId}/render/telegram-preview.jpg`
}

export function jigsawImageObjectKey(
  compositionId: string,
  format: RenderFormat
): string {
  const extension = format === "jpeg" ? "jpg" : format

  return `compositions/${compositionId}/render/canvas.${extension}`
}
