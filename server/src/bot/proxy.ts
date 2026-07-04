import { ProxyAgent, setGlobalDispatcher } from "undici"

import { readOptionalEnv } from "@/infra/env"

export function setupTelegramProxy(): void {
  const proxyUrl = readOptionalEnv("TELEGRAM_PROXY_URL")

  if (!proxyUrl) {
    return
  }

  setGlobalDispatcher(new ProxyAgent(proxyUrl))
}
