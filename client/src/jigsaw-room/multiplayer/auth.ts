const AUTH_SESSION_STORAGE_KEY = "puzzle-room-auth"
const LEGACY_AUTH_SESSION_STORAGE_KEY = "jigsaw-room-auth"
const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000"
const TELEGRAM_BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME

export interface AuthUser {
  id: string
  telegramId: string
  username: string | null
  firstName: string | null
  lastName: string | null
  photoUrl: string | null
  displayName: string
  color: string
}

export interface AuthSession {
  token: string
  user: AuthUser
}

export interface JigsawHistoryItem {
  roomId: string
  completedAt: string
  elapsedMs: number
  pieceCount: number
  snapCount: number
  source: {
    kind: "dev" | "batch_render" | "external"
    label: string
  }
  participants: Array<{
    userId?: string
    telegramId?: string
    name: string
    color: string
  }>
}

interface TelegramWebAppGlobal {
  WebApp?: {
    initData?: string
  }
}

declare global {
  interface Window {
    Telegram?: TelegramWebAppGlobal
  }
}

export function readLocalAuthSession(): AuthSession | null {
  try {
    const raw =
      localStorage.getItem(AUTH_SESSION_STORAGE_KEY) ??
      localStorage.getItem(LEGACY_AUTH_SESSION_STORAGE_KEY)
    const value = raw ? JSON.parse(raw) : null

    return parseAuthSession(value)
  } catch {
    return null
  }
}

export function saveLocalAuthSession(session: AuthSession): void {
  localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session))
  localStorage.removeItem(LEGACY_AUTH_SESSION_STORAGE_KEY)
}

export function hasTelegramWebAppInitData(): boolean {
  return Boolean(window.Telegram?.WebApp?.initData)
}

export function getTelegramBotUsername(): string | null {
  const username = normalizeTelegramBotUsername(TELEGRAM_BOT_USERNAME)

  return isTelegramBotUsername(username) ? username : null
}

export function getTelegramLoginWidgetBlocker(): string | null {
  const hostname = window.location.hostname

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "Telegram widget needs public domain. Use Telegram WebApp, ngrok, or prod URL"
  }

  if (window.location.protocol !== "https:") {
    return "Telegram widget needs HTTPS domain set via BotFather /setdomain"
  }

  return null
}

export async function loginTelegramWebApp(
  anonSessionToken: string
): Promise<AuthSession> {
  const initData = window.Telegram?.WebApp?.initData

  if (!initData) {
    throw new Error("Open from Telegram to login")
  }

  return requestAuth("/api/auth/telegram-webapp", {
    initData,
    anonSessionToken,
  })
}

export async function loginTelegramWidget(
  payload: Record<string, unknown>,
  anonSessionToken: string
): Promise<AuthSession> {
  return requestAuth("/api/auth/telegram-widget", {
    ...payload,
    anonSessionToken,
  })
}

export async function fetchAuthMe(token: string): Promise<AuthSession> {
  const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
    headers: authHeaders(token),
  })
  const payload = await readJson(response)

  if (!isRecord(payload) || !isRecord(payload.user)) {
    throw new Error("Invalid auth response")
  }

  return { token, user: payload.user as unknown as AuthUser }
}

export async function fetchJigsawHistory(
  token: string
): Promise<JigsawHistoryItem[]> {
  const response = await fetch(`${API_BASE_URL}/api/me/puzzle-history`, {
    headers: authHeaders(token),
  })
  const payload = await readJson(response)

  if (!isRecord(payload) || !Array.isArray(payload.history)) {
    throw new Error("Invalid history response")
  }

  return payload.history as JigsawHistoryItem[]
}

async function requestAuth(
  path: string,
  body: Record<string, unknown>
): Promise<AuthSession> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const payload = await readJson(response)
  const session = parseAuthSession(payload)

  if (!session) {
    throw new Error("Invalid auth response")
  }

  saveLocalAuthSession(session)

  return session
}

async function readJson(response: Response): Promise<unknown> {
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    if (isRecord(payload) && typeof payload.error === "string") {
      throw new Error(payload.error)
    }

    throw new Error(`Request failed: ${response.status}`)
  }

  return payload
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` }
}

function parseAuthSession(value: unknown): AuthSession | null {
  if (!isRecord(value) || typeof value.token !== "string") {
    return null
  }

  const user = parseAuthUser(value.user)

  return user ? { token: value.token, user } : null
}

function parseAuthUser(value: unknown): AuthUser | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.telegramId !== "string" ||
    typeof value.displayName !== "string" ||
    typeof value.color !== "string"
  ) {
    return null
  }

  return {
    id: value.id,
    telegramId: value.telegramId,
    username: readNullableString(value.username),
    firstName: readNullableString(value.firstName),
    lastName: readNullableString(value.lastName),
    photoUrl: readNullableString(value.photoUrl),
    displayName: value.displayName,
    color: value.color,
  }
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function normalizeTelegramBotUsername(value: unknown): string {
  if (typeof value !== "string") {
    return ""
  }

  const trimmed = value.trim()

  if (!trimmed || trimmed.includes("<")) {
    return ""
  }

  const withoutProtocol = trimmed.replace(/^https?:\/\//i, "")
  const withoutTelegramHost = withoutProtocol.replace(
    /^(t\.me|telegram\.me)\//i,
    ""
  )

  return withoutTelegramHost.replace(/^@/, "").split(/[/?#]/)[0] ?? ""
}

function isTelegramBotUsername(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(value) && /bot$/i.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
