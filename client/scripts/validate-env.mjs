import { loadEnv } from "vite"

const env = { ...loadEnv("production", process.cwd(), ""), ...process.env }
const isVercel = env.VERCEL === "1" || env.VERCEL === "true"
const errors = []

if (isVercel) {
  validateRequiredHttpsUrl("VITE_API_URL")
  validateTelegramBotUsername()
  validateWebSocketUrl()
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error)
  }

  process.exit(1)
}

function validateRequiredHttpsUrl(name) {
  const value = readString(env[name])

  if (!value) {
    errors.push(`${name} is required on Vercel`)
    return
  }

  let url

  try {
    url = new URL(value)
  } catch {
    errors.push(`${name} must be a valid URL`)
    return
  }

  if (url.protocol !== "https:") {
    errors.push(`${name} must use HTTPS on Vercel`)
  }

  if (isLocalHost(url.hostname)) {
    errors.push(`${name} must not point to localhost on Vercel`)
  }
}

function validateTelegramBotUsername() {
  const value = readString(env.VITE_TELEGRAM_BOT_USERNAME)

  if (!value || value.includes("<")) {
    errors.push("VITE_TELEGRAM_BOT_USERNAME is required on Vercel")
    return
  }

  const username = value.replace(/^@/, "")

  if (!/^[a-zA-Z0-9_]{5,32}$/.test(username)) {
    errors.push("VITE_TELEGRAM_BOT_USERNAME must be a Telegram username")
  }
}

function validateWebSocketUrl() {
  const value = readString(env.VITE_JIGSAW_WS_URL)

  if (!value) {
    return
  }

  let url

  try {
    url = new URL(value)
  } catch {
    errors.push("VITE_JIGSAW_WS_URL must be a valid URL")
    return
  }

  if (url.protocol !== "wss:") {
    errors.push("VITE_JIGSAW_WS_URL must use WSS on Vercel")
  }

  if (isLocalHost(url.hostname)) {
    errors.push("VITE_JIGSAW_WS_URL must not point to localhost on Vercel")
  }
}

function readString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : ""
}

function isLocalHost(hostname) {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
  )
}
