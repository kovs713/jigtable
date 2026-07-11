export function compositionSourceImageObjectKey(
  compositionId: string,
  fileId: string
): string {
  return `compositions/${compositionId}/photos/${encodeURIComponent(fileId)}`
}

export function jigsawImageObjectKey(
  compositionId: string,
  format: string
): string {
  const extension = format === "jpeg" ? "jpg" : format

  return `compositions/${compositionId}/render/canvas.${extension}`
}

export function photoObjectKey(
  chatId: number,
  userId: number,
  fileId: string
): string {
  return `photos/${chatId}/${userId}__${encodeURIComponent(fileId)}`
}
