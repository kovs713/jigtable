import type { JigsawSession } from "@jigtable/core/protocol"
import { optional, string } from "@jigtable/shared/schemas"

import { ApiError } from "@/api/http/errors"
import { parseApiSchema } from "@/api/http/request"
import type { Context } from "@/api/http/router"
import { type TelegramAuthProfile } from "./"

// FIX: should be a auth() middleware

export async function requireJigsawSession(
  request: Request,
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

export function readJigsawAuthToken(request: Request): string | null {
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
