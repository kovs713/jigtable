import { HttpError, type Transformer } from "grammy"

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]

type BunProxyInit = RequestInit & {
  proxy?: string
}

const nativeFetch = globalThis.fetch

async function telegramFetchImplementation(
  input: FetchInput,
  init?: FetchInit
): Promise<Response> {
  const proxyUrl = process.env.TELEGRAM_PROXY_URL

  return nativeFetch(input, {
    ...init,
    ...(proxyUrl ? { proxy: proxyUrl } : {}),
  } as BunProxyInit)
}

export const telegramApiFetch: typeof fetch = Object.assign(
  telegramFetchImplementation,
  {
    preconnect: nativeFetch.preconnect.bind(nativeFetch),
  }
)

export function retryTelegramHttpErrors(maxRetryAttempts = 2): Transformer {
  return async (previous, method, payload, signal) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await previous(method, payload, signal)
      } catch (error) {
        if (
          method === "getUpdates" ||
          !(error instanceof HttpError) ||
          signal?.aborted ||
          attempt >= maxRetryAttempts
        ) {
          throw error
        }

        await Bun.sleep(1_000 * 2 ** attempt)
      }
    }
  }
}
