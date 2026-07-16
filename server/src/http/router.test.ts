import { describe, expect, test } from "bun:test"

import type { Services } from "@/services"
import { errorBoundary } from "./middleware"
import { createRouter, type Middleware } from "./router"

const services = {} as Services

describe("HTTP router", () => {
  test("decodes path parameters", async () => {
    const router = createRouter({ services, middleware: [] })

    router.get("/items/:itemId", {
      handler: ({ params }) => Response.json(params),
    })

    const response = await router.fetch(
      new Request("http://localhost/items/item%201")
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ itemId: "item 1" })
  })

  test("runs global middleware for unmatched routes", async () => {
    const addHeader: Middleware = async (_context, next) => {
      const response = await next()
      const headers = new Headers(response.headers)
      headers.set("x-router-middleware", "applied")

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }
    const router = createRouter({ services, middleware: [addHeader] })

    const response = await router.fetch(
      new Request("http://localhost/not-registered")
    )

    expect(response.status).toBe(404)
    expect(response.headers.get("x-router-middleware")).toBe("applied")
  })

  test("handles malformed encoded parameters through the error boundary", async () => {
    const router = createRouter({ services, middleware: [errorBoundary()] })

    router.get("/items/:itemId", {
      handler: () => new Response(null, { status: 204 }),
    })

    const response = await router.fetch(
      new Request("http://localhost/items/%E0%A4%A")
    )

    expect(response.status).toBe(400)
  })

  test("rejects duplicate method and path registrations", () => {
    const router = createRouter({ services, middleware: [] })
    const config = { handler: () => new Response(null, { status: 204 }) }

    router.get("/items/:itemId", config)

    expect(() => router.get("/items/:itemId", config)).toThrow(
      "Duplicate HTTP route: GET /items/:itemId"
    )
  })
})
