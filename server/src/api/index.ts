import { serve, type BunRequest } from "bun"

import { TelegramAuthService } from "@/auth"
import { LIMITS } from "@/config"
import { readPortEnv } from "@/infra/env"
import { JigsawHistoryStore } from "@/jigsaw-room/history-store"
import {
  JigsawRoomManager,
  type JigsawSocketData,
} from "@/jigsaw-room/room-manager"
import { JigsawSessionStore } from "@/jigsaw-room/session-store"
import { routes } from "./routes"
import { json } from "./utils"

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
  const port = readPortEnv("PORT", 3000)

  const server = serve<JigsawSocketData>({
    port,

    maxRequestBodySize: LIMITS.jsonBodyBytes,

    fetch(request: BunRequest, server) {
      const url = new URL(request.url)

      if (url.pathname === "/api/jigsaw/ws") {
        if (server.upgrade(request, { data: {} })) {
          return undefined
        }

        return json(
          { error: "WebSocket upgrade failed" },
          400,
          undefined,
          request
        )
      }

      return json({ error: "Not found" }, 404, undefined, request)
    },

    routes: routes,

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
