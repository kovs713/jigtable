import { serve, type BunRequest } from "bun"

import { TelegramAuthService } from "@/auth/telegram"
import { PuzzleHistoryStore } from "@/puzzle-room/history-store"
import type { PuzzleSocketData } from "@/puzzle-room/room-manager"
import { PuzzleRoomManager } from "@/puzzle-room/room-manager"
import { PuzzleSessionStore } from "@/puzzle-room/session-store"
import { CORS_HEADERS } from "./constants"
import {
  handleAuthLogout,
  handleCreatePuzzleRoom,
  handleGetAuthMe,
  handleGetImage,
  handleGetLayout,
  handleGetPuzzleHistory,
  handleGetPuzzleRoom,
  handleGetPuzzleSession,
  handleGetRendered,
  handlePatchLayout,
  handlePatchPuzzleSession,
  handleRender,
  handleRestorePuzzleSession,
  handleTelegramWebAppAuth,
  handleTelegramWidgetAuth,
} from "./handlers"
import { json, readErrorMessage } from "./utils"

export function startApiServer(): void {
  const port = Number(process.env.PORT)

  const puzzleSessionsService = new PuzzleSessionStore()
  const puzzleHistoryService = new PuzzleHistoryStore()
  const puzzleRoomsService = new PuzzleRoomManager(
    puzzleSessionsService,
    puzzleHistoryService
  )
  const authService = new TelegramAuthService()
  const puzzle = {
    rooms: puzzleRoomsService,
    sessions: puzzleSessionsService,
    history: puzzleHistoryService,
    auth: authService,
  }

  const server = serve<PuzzleSocketData>({
    port,

    fetch(request: BunRequest, server) {
      const url = new URL(request.url)

      if (url.pathname === "/api/puzzle/ws") {
        if (server.upgrade(request, { data: {} })) {
          return undefined
        }

        return json({ error: "WebSocket upgrade failed" }, 400)
      }

      return json({ error: "Not found" }, 404)
    },

    routes: {
      "": {
        OPTIONS: new Response(null, { headers: CORS_HEADERS }),
      },

      "/api/health": {
        GET: json({ ok: true }),
      },

      "/api/auth/telegram-webapp": {
        POST: route((request: BunRequest) =>
          handleTelegramWebAppAuth(request, puzzle)
        ),
      },

      "/api/auth/telegram-widget": {
        POST: route((request: BunRequest) =>
          handleTelegramWidgetAuth(request, puzzle)
        ),
      },

      "/api/auth/me": {
        GET: route((request: BunRequest) =>
          handleGetAuthMe(request, authService)
        ),
      },

      "/api/auth/logout": {
        POST: route((request: BunRequest) =>
          handleAuthLogout(request, authService)
        ),
      },

      "/api/me/puzzle-history": {
        GET: route((request: BunRequest) =>
          handleGetPuzzleHistory(request, puzzle)
        ),
      },

      "/api/puzzle/sessions": {
        POST: route((request: BunRequest) =>
          handleRestorePuzzleSession(request, puzzleSessionsService)
        ),
      },

      "/api/puzzle/sessions/current": {
        GET: route((request: BunRequest) =>
          handleGetPuzzleSession(request, puzzleSessionsService)
        ),
        PATCH: route((request: BunRequest) =>
          handlePatchPuzzleSession(request, puzzle)
        ),
      },

      "/api/puzzle/rooms": {
        POST: route((request: BunRequest) =>
          handleCreatePuzzleRoom(request, puzzleRoomsService)
        ),
      },

      "/api/puzzle/rooms/:roomId": {
        GET: route((request: BunRequest) =>
          handleGetPuzzleRoom(request, puzzleRoomsService)
        ),
      },
      "/api/:batchId/layout": {
        GET: handleGetLayout,
        PATCH: route(handlePatchLayout),
      },
      "/api/:batchId/images/:fileId": {
        GET: route(handleGetImage),
      },
      "/api/:batchId/render": {
        POST: route(handleRender),
      },
      "/api/:batchId/rendered": {
        GET: route(handleGetRendered),
      },
    },

    websocket: {
      message(socket, message) {
        void puzzleRoomsService
          .handleMessage(socket, message)
          .catch((error) => {
            console.error("Puzzle websocket error", error)
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
        puzzleRoomsService.handleClose(socket)
      },
    },
  })

  console.log(`API listening on :${server.port}`)
}

function route(handler: (request: BunRequest) => Response | Promise<Response>) {
  return async (request: BunRequest) => {
    try {
      return await handler(request)
    } catch (error) {
      console.error("API fatal error", error)

      return json({ error: readErrorMessage(error) }, 500)
    }
  }
}
