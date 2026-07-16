import { afterEach, describe, expect, test } from "bun:test"

import type { Services } from "@/services"
import { ApiError } from "./errors"
import { cors, errorBoundary } from "./middleware"
import { createRouter } from "./router"

const originalCorsOrigin = process.env.CORS_ORIGIN
const services = {} as Services

afterEach(() => {
  process.env.CORS_ORIGIN = originalCorsOrigin
})

describe("CORS middleware", () => {
  test("sets the request origin only when it is allowed", async () => {
    process.env.CORS_ORIGIN = "https://client.example"
    const router = createRouter({ services, middleware: [cors()] })
    router.get("/health", { handler: () => Response.json({ ok: true }) })

    const allowed = await router.fetch(
      new Request("http://localhost/health", {
        headers: { Origin: "https://client.example" },
      })
    )
    const denied = await router.fetch(
      new Request("http://localhost/health", {
        headers: { Origin: "https://other.example" },
      })
    )

    expect(allowed.headers.get("access-control-allow-origin")).toBe(
      "https://client.example"
    )
    expect(denied.headers.get("access-control-allow-origin")).toBeNull()
  })

  test("adds CORS headers to error responses", async () => {
    process.env.CORS_ORIGIN = "https://client.example"
    const router = createRouter({
      services,
      middleware: [cors(), errorBoundary()],
    })
    router.get("/failure", {
      handler: () => {
        throw new ApiError("Failed", 400)
      },
    })

    const response = await router.fetch(
      new Request("http://localhost/failure", {
        headers: { Origin: "https://client.example" },
      })
    )

    expect(response.status).toBe(400)
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://client.example"
    )
  })
})
