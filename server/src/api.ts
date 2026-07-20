import { serve, type BunRequest, type Server } from "bun"

import { LIMITS } from "@/config"
import { metricsRegistry } from "@/observability/metrics"
import { roomMetrics } from "@/observability/room-metrics"
import { createServices } from "@/services"
import { errorResponse } from "./http/errors"
import { cors, errorBoundary } from "./http/middleware"
import { createRouter } from "./http/router"
import { registerRoutes } from "./http/routes"
import { RoomController } from "./ws/room-controller"
import { WsRoomPublisher } from "./ws/room-publisher"
import { RoomSocketRegistry } from "./ws/room-socket-registry"
import { createWsRouter } from "./ws/router"
import type { WsData } from "./ws/types"

export type ApiServer = {
  server: Server<WsData>
  stop(): void
}

export function startApiServer(): ApiServer {
  const port = Number(process.env.PORT)

  const sockets = new RoomSocketRegistry()
  const roomPublisher = new WsRoomPublisher(sockets)
  const services = createServices({ roomPublisher, roomMetrics })
  const roomController = new RoomController(services.rooms, sockets)

  const router = createRouter({
    services,
    middleware: [cors(), errorBoundary()],
  })

  registerRoutes(router)

  const wsRouter = createWsRouter({
    services,
    roomController,
  })

  services.rooms.start()

  let server: Server<WsData>

  try {
    server = serve<WsData>({
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
  } catch (error) {
    services.rooms.stop()
    throw error
  }

  console.log(`API listening on :${server.port}`)

  return {
    server,
    stop() {
      services.rooms.stop()
      server.stop(true)
    },
  }
}
