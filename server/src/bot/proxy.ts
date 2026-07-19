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
  const requestInit = proxyUrl ? await normalizeMultipartBody(init) : init

  return nativeFetch(input, {
    ...requestInit,
    ...(proxyUrl ? { proxy: proxyUrl } : {}),
  } as BunProxyInit)
}

async function normalizeMultipartBody(init?: FetchInit): Promise<FetchInit> {
  if (!(init?.body instanceof ReadableStream)) {
    return init
  }

  const contentType = new Headers(init.headers).get("content-type")
  const source = await new Response(init.body, {
    headers: contentType ? { "content-type": contentType } : undefined,
  }).formData()
  const body = new FormData()
  const directAttachments = new Set<string>()

  for (const value of source.values()) {
    if (typeof value === "string" && value.startsWith("attach://")) {
      directAttachments.add(value.slice("attach://".length))
    }
  }

  for (const [key, value] of source) {
    if (typeof value !== "string") {
      if (!directAttachments.has(key)) {
        body.set(key, value)
      }
      continue
    }

    if (value.startsWith("attach://")) {
      const attachment = source.get(value.slice("attach://".length))

      if (attachment === null || typeof attachment === "string") {
        throw new Error("Telegram multipart attachment is missing")
      }

      body.set(key, attachment)
      continue
    }

    body.set(key, value)
  }

  const headers = new Headers(init.headers)
  headers.delete("connection")
  headers.delete("content-length")
  headers.delete("content-type")

  return {
    ...init,
    body,
    headers,
  }
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
