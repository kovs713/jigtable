import { serve, type BunRequest } from "bun"

import { TelegramAuthService } from "@/auth"
import { LIMITS } from "@/config"
import { JigsawHistoryStore } from "@/jigsaw-room/history-store"
import {
  JigsawRoomManager,
  type JigsawSocketData,
} from "@/jigsaw-room/room-manager"
import { JigsawSessionStore } from "@/jigsaw-room/session-store"
import { errorResponse } from "./errors"
import { cors, errorBoundary } from "./middlewares"
import { registerRoutes } from "./routes"
import { createRouter } from "./types"

const jigsawSessionsService = new JigsawSessionStore()
const jigsawHistoryService = new JigsawHistoryStore()
const jigsawRoomsService = new JigsawRoomManager(
  jigsawSessionsService,
  jigsawHistoryService
)
const authService = new TelegramAuthService()
export const services = {
  rooms: jigsawRoomsService,
  sessions: jigsawSessionsService,
  history: jigsawHistoryService,
  auth: authService,
}

export function startApiServer(): void {
  const port = Number(process.env.PORT) ?? 3000

  const router = createRouter({
    services,
    middleware: [cors(), errorBoundary()],
  })

  registerRoutes(router)

  const server = serve<JigsawSocketData>({
    port,

    maxRequestBodySize: LIMITS.jsonBodyBytes,

    fetch(request: BunRequest, server) {
      const url = new URL(request.url)

      if (url.pathname === "/api/jigsaw/ws") {
        if (server.upgrade(request, { data: {} })) {
          return undefined
        }

        return errorResponse("WebSocket upgrade failed", 400)
      }

      return router.fetch(request)
    },

    websocket: {
      message(socket, message) {
        void services.rooms.handleMessage(socket, message).catch((error) => {
          console.error("Jigsaw websocket error", error)
          socket.send(
            JSON.stringify({
              type: "error",
              code: "internal_error",
              message: "Internal error",
            })
          )
        })
      },

      close(socket) {
        jigsawRoomsService.handleClose(socket)
      },
    },
  })

  console.log(`API listening on :${server.port}`)
}
