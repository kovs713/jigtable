import { HttpError, type Transformer } from "grammy"

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]

type BunProxyInit = RequestInit & {
  proxy?: string
}

type GrammyFetchInit = NonNullable<FetchInit> & {
  agent?: unknown
  compress?: unknown
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
  const contentType = new Headers(init?.headers).get("content-type")

  if (!init?.body || !contentType?.startsWith("multipart/form-data")) {
    return init
  }

  const source = await new Response(
    init.body as ConstructorParameters<typeof Response>[0],
    {
      headers: { "content-type": contentType },
    }
  ).formData()
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
        body.set(key, await copyMultipartFile(value))
      }
      continue
    }

    if (value.startsWith("attach://")) {
      const attachment = source.get(value.slice("attach://".length))

      if (attachment === null || typeof attachment === "string") {
        throw new Error("Telegram multipart attachment is missing")
      }

      body.set(key, await copyMultipartFile(attachment))
      continue
    }

    body.set(key, value)
  }

  const headers = new Headers(init.headers)
  headers.delete("connection")
  headers.delete("content-length")
  headers.delete("content-type")
  const {
    agent: _agent,
    compress: _compress,
    ...requestInit
  } = init as GrammyFetchInit

  return {
    ...requestInit,
    body,
    headers,
  }
}

async function copyMultipartFile(file: Blob): Promise<File> {
  const name = "name" in file ? String(file.name) : "media"

  return new File([await file.arrayBuffer()], name, { type: file.type })
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
