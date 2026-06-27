export function photoObjectKey(
  chatId: number,
  userId: number,
  fileId: string
): string {
  return `photos/${chatId}/${userId}__${encodeURIComponent(fileId)}`
}
