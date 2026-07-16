import { describe, expect, test } from "bun:test"

import { apiRoutes } from "@jigtable/shared/api-routes"

import type { Services } from "@/services"
import { errorBoundary } from "./middleware"
import { createRouter } from "./router"
import { registerRoutes } from "./routes"

describe("HTTP routes", () => {
  test("claims player session after Telegram Widget login", async () => {
    const calls: Array<[string, unknown]> = []
    const services = {
      telegramAuth: {
        verifyLoginWidget(payload: Record<string, unknown>) {
          calls.push(["verify", payload])
          return { telegramId: "123456", firstName: "Ada" }
        },
      },
      auth: {
        async signInWithTelegram(_identity: unknown, seed: unknown) {
          calls.push(["sign-in", seed])
          return {
            token: "auth-token",
            user: {
              id: "user-1",
              telegramId: "123456",
              username: null,
              firstName: "Ada",
              lastName: null,
              photoUrl: null,
              displayName: "Player 1",
              color: "#123abc",
            },
            expiresAt: "2026-02-01T00:00:00.000Z",
          }
        },
      },
      playerSessions: {
        async get(token: string) {
          calls.push(["get-player-session", token])
          return {
            token,
            player: {
              id: "player-1",
              name: "Player 1",
              color: "#123abc",
            },
            createdAt: 1,
            updatedAt: 1,
          }
        },
        async linkToUser(token: string, userId: string) {
          calls.push(["link-player-session", { token, userId }])
          return null
        },
      },
      history: {
        async linkPlayerSessionToUser(token: string, userId: string) {
          calls.push(["link-history", { token, userId }])
        },
      },
    } as unknown as Services
    const router = createRouter({
      services,
      middleware: [errorBoundary()],
    })

    registerRoutes(router)

    const response = await router.fetch(
      new Request(
        `http://localhost${apiRoutes.auth.post.telegram.widget.pattern}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: "123456",
            auth_date: "1767225600",
            hash: "signed-hash",
            anonSessionToken: "player-session",
          }),
        }
      )
    )

    expect(response.status).toBe(200)
    expect(calls).toEqual([
      [
        "verify",
        {
          id: "123456",
          auth_date: "1767225600",
          hash: "signed-hash",
        },
      ],
      ["get-player-session", "player-session"],
      ["sign-in", { displayName: "Player 1", color: "#123abc" }],
      ["link-player-session", { token: "player-session", userId: "user-1" }],
      ["link-history", { token: "player-session", userId: "user-1" }],
    ])
  })
})
