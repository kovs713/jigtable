import { readOptionalEnv } from "@/infra/env"

type FetchWithBunProxy = typeof fetch
type FetchInput = Parameters<typeof fetch>[0]

type BunProxyInit = RequestInit & {
  proxy?: string
}

export function setupTelegramProxy(): void {
  const proxyUrl = process.env.TELEGRAM_PROXY_URL

  if (!proxyUrl) {
    return
  }

  const nativeFetch = globalThis.fetch.bind(globalThis)

  globalThis.fetch = ((input, init) => {
    if (!isTelegramApiRequest(input)) {
      return nativeFetch(input, init)
    }

    return nativeFetch(input, { ...init, proxy: proxyUrl } as BunProxyInit)
  }) as FetchWithBunProxy
}

export const telegramApiFetch: FetchWithBunProxy = ((input, init) => {
  const proxyUrl = process.env.TELEGRAM_PROXY_URL

  if (!proxyUrl) {
    return fetch(input, init)
  }

  return fetch(input, { ...init, proxy: proxyUrl } as BunProxyInit)
}) as FetchWithBunProxy

function isTelegramApiRequest(input: FetchInput): boolean {
  const url = readRequestUrl(input)

  return url?.hostname === "api.telegram.org"
}

function readRequestUrl(input: FetchInput): URL | null {
  try {
    if (typeof input === "string" || input instanceof URL) {
      return new URL(input)
    }

    return new URL(input.url)
  } catch {
    return null
  }
}
