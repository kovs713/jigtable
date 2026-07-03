const LOCAL_API_BASE_URL = "http://localhost:3000"

export const API_BASE_URL = readApiBaseUrl()
export const TELEGRAM_BOT_USERNAME = readOptionalString(
  import.meta.env.VITE_TELEGRAM_BOT_USERNAME
)
export const JIGSAW_WS_ENABLED = import.meta.env.VITE_JIGSAW_WS_ENABLED !== "false"
export const JIGSAW_WS_URL = readOptionalString(
  import.meta.env.VITE_JIGSAW_WS_URL
)

function readApiBaseUrl(): string {
  const raw =
    readOptionalString(import.meta.env.VITE_API_URL) ?? LOCAL_API_BASE_URL
  const url = new URL(raw, window.location.href)

  if (import.meta.env.PROD && !isLocalBrowser()) {
    if (isLocalHost(url.hostname)) {
      throw new Error("VITE_API_URL must be set for production deploys")
    }

    if (url.protocol !== "https:") {
      throw new Error("VITE_API_URL must use HTTPS in production")
    }
  }

  return stripTrailingSlash(url.toString())
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/$/, "")
}

function isLocalBrowser(): boolean {
  return isLocalHost(window.location.hostname)
}

function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
  )
}
