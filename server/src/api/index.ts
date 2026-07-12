import { serve, type BunRequest } from "bun"

import { LIMITS } from "@/config"
import { metricsRegistry } from "@/observability/metrics"
import { createServices } from "@/services"
import { errorResponse } from "./http/errors"
import { cors, errorBoundary } from "./http/middleware"
import { createRouter } from "./http/router"
import { registerRoutes } from "./http/routes"
import { createWsRouter } from "./ws/router"
import { registerWsRoutes } from "./ws/routes"
import type { WsData } from "./ws/types"

export function startApiServer(): void {
  const port = Number(process.env.PORT)

  const services = createServices()

  const router = createRouter({
    services,
    middleware: [errorBoundary(), cors()],
  })

  registerRoutes(router)

  const wsRouter = createWsRouter({ services })
  registerWsRoutes(wsRouter)

  const server = serve<WsData>({
    port,
    maxRequestBodySize: LIMITS.jsonBodyBytes,

    async fetch(request: BunRequest, server) {
      const url = new URL(request.url)

      if (url.pathname === "/metrics") {
        return new Response(await metricsRegistry.metrics(), {
          headers: {
            "content-type": metricsRegistry.contentType,
          },
        })
      }

      if (url.pathname === "/api/jigsaw/ws") {
        if (
          server.upgrade(request, {
            data: {
              connectionId: crypto.randomUUID(),
            },
          })
        ) {
          return undefined
        }

        return errorResponse("WebSocket upgrade failed", 400)
      }

      return router.fetch(request)
    },

    websocket: {
      open(socket) {
        return wsRouter.open(socket)
      },

      message(socket, message) {
        return wsRouter.message(socket, message)
      },

      close(socket, code) {
        return wsRouter.close(socket, code)
      },
    },
  })

  console.log(`API listening on :${server.port}`)
}
