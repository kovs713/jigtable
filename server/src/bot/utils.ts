export function clientLayoutUrl(compositionId: string, token: string): string {
  const url = new URL(`${process.env.CLIENT_URL}/editor`)

  url.searchParams.set("compositionId", compositionId)
  url.searchParams.set("token", token)

  return url.toString()
}
