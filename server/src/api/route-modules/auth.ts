import {
  isWhitelistDeniedError,
  readAuthToken,
  validateTelegramLoginWidget,
  validateTelegramWebAppInitData,
} from "@/auth"
import { string } from "@jigtable/shared"

import { ApiError } from "../errors"
import {
  authorizeTelegramProfile,
  requireAuthenticatedSession,
} from "../http/auth"
import type { Router } from "../types"
import { parseApiSchema, readErrorMessage, readJsonLimited } from "../utils"

export function registerAuthRoutes(router: Router): void {
  router.post("/api/auth/telegram-webapp", {
    handler: async (context) => {
      const body = await readJsonLimited(context.request)
      const initData = parseApiSchema(string(), body?.initData, "initData")

      try {
        const profile = validateTelegramWebAppInitData(initData)

        return authorizeTelegramProfile(context, body, profile)
      } catch (error) {
        throw toAuthApiError(error)
      }
    },
  })

  router.post("/api/auth/telegram-widget", {
    handler: async (context) => {
      const body = await readJsonLimited(context.request)

      if (!body) {
        throw new ApiError("Telegram payload is required", 400)
      }

      try {
        const profile = validateTelegramLoginWidget(body)

        return authorizeTelegramProfile(context, body, profile)
      } catch (error) {
        throw toAuthApiError(error)
      }
    },
  })

  router.get("/api/auth/me", {
    handler: async (context) => {
      const session = await requireAuthenticatedSession(
        context.request,
        context.services.auth
      )

      return Response.json({ user: session.user, expiresAt: session.expiresAt })
    },
  })

  router.post("/api/auth/dev-login", {
    handler: async (context) => {
      const hostname = new URL(context.request.url).hostname

      if (hostname !== "localhost" && hostname !== "127.0.0.1") {
        throw new ApiError("Not found", 404)
      }

      const body = await readJsonLimited(context.request)
      const telegramId = body?.telegramId
        ? parseApiSchema(string(), body.telegramId, "telegramId")
        : undefined
      const session = await context.services.auth.loginDev(telegramId)

      return Response.json(session)
    },
  })

  router.post("/api/auth/logout", {
    handler: async (context) => {
      const token = readAuthToken(context.request)

      if (token) {
        await context.services.auth.logout(token)
      }

      return Response.json({ ok: true })
    },
  })

  router.get("/api/me/jigsaw-history", {
    handler: async (context) => {
      const session = await requireAuthenticatedSession(
        context.request,
        context.services.auth
      )
      const history = await context.services.history.getUserHistory(
        session.user.id
      )

      return Response.json({ history })
    },
  })
}

function toAuthApiError(error: unknown): ApiError {
  return new ApiError(
    readErrorMessage(error),
    isWhitelistDeniedError(error) ? 403 : 401
  )
}
