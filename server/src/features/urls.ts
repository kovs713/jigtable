export function clientLayoutUrl(batchId: string, token: string): string {
  const baseUrl = process.env.CLIENT_URL
  const url = new URL(baseUrl)

  url.searchParams.set("batchId", batchId)
  url.searchParams.set("token", token)

  return url.toString()
}

export function clientPuzzleRoomUrl(roomId: string): string {
  const baseUrl = process.env.CLIENT_URL
  const url = new URL(`/puzzle/${encodeURIComponent(roomId)}`, baseUrl)

  return url.toString()
}

export function publicApiUrl(): string {
  return process.env.PUBLIC_API_URL
}
