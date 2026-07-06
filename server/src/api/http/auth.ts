import {
  readAuthToken,
  TelegramAuthService,
  type TelegramAuthProfile,
} from "@/auth"
import type { JigsawSession } from "@jigtable/jigsaw-core"
import { optional, string } from "@jigtable/shared"
import type { BunRequest } from "bun"

import { ApiError } from "../errors"
import type { Context } from "../types"
import { parseApiSchema } from "../utils/request"

export async function requireAuthenticatedUser(
  request: BunRequest,
  auth: TelegramAuthService
) {
  return (await requireAuthenticatedSession(request, auth)).user
}

export async function requireAuthenticatedSession(
  request: BunRequest,
  auth: TelegramAuthService
) {
  const token = readAuthToken(request)

  if (!token) {
    throw new ApiError("Auth token required", 401)
  }

  const session = await auth.getSession(token)

  if (!session) {
    throw new ApiError("Auth session not found", 401)
  }

  return session
}

export async function readOptionalAuthenticatedUser(
  request: BunRequest,
  auth: TelegramAuthService
) {
  const token = readAuthToken(request)

  if (!token) {
    return null
  }

  const user = await auth.getUser(token)

  if (!user) {
    throw new ApiError("Auth session not found", 401)
  }

  return user
}

export async function requireJigsawSession(
  request: BunRequest,
  sessions: { getSession(token: string): Promise<JigsawSession | null> }
): Promise<JigsawSession> {
  const token = readJigsawAuthToken(request)

  if (!token) {
    throw new ApiError("Jigsaw session token required", 401)
  }

  const session = await sessions.getSession(token)

  if (!session) {
    throw new ApiError("Jigsaw session not found", 401)
  }

  return session
}

export function readJigsawAuthToken(request: BunRequest): string | null {
  const authorization = request.headers.get("authorization")

  if (authorization?.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice("bearer ".length).trim()

    return token || null
  }

  const token = new URL(request.url).searchParams.get("token")?.trim()

  return token || null
}

export async function authorizeTelegramProfile(
  context: Context,
  body: Record<string, unknown> | null,
  profile: TelegramAuthProfile
): Promise<Response> {
  const anonSessionToken = parseApiSchema(
    optional(string()),
    body?.anonSessionToken,
    "anonSessionToken"
  )?.trim()
  const anonSession = anonSessionToken
    ? await context.services.sessions.getSession(anonSessionToken)
    : null
  const auth = await context.services.auth.login(profile, {
    name: anonSession?.player.name,
    color: anonSession?.player.color,
  })

  if (anonSessionToken) {
    await context.services.sessions.linkSessionToUser(
      anonSessionToken,
      auth.user.id
    )
    await context.services.history.linkAnonSessionToUser(
      anonSessionToken,
      auth.user.id
    )
  }

  return Response.json(auth)
}
