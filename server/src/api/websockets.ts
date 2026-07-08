import type { ServerWebSocket } from "bun"

import { isRecord } from "@jigtable/shared"

import { sendWsError } from "./errors"
import { parseWsJson, wsErrorBoundary } from "./middlewares"
import type { Services } from "./types"

export type WsData = {
  socketId: string
  userId?: string
  roomId?: string
  state: Map<symbol, unknown>
}

export type WsSocket = ServerWebSocket<WsData>

export type WsContext = {
  socket: WsSocket
  services: Services

  raw: string | Buffer
  message?: unknown

  socketId: string
  userId?: string
  roomId?: string

  state: Map<symbol, unknown>
}

export type WsHandler = (context: WsContext) => Promise<void>

export type WsMiddleware = (
  context: WsContext,
  next: () => Promise<void>
) => Promise<void>

export function composeWs(
  middlewares: WsMiddleware[],
  handler: WsHandler
): WsHandler {
  return async function pipeline(context: WsContext): Promise<void> {
    let index = -1

    async function dispatch(i: number): Promise<void> {
      if (i <= index) {
        throw new Error("next() called multiple times")
      }

      index = i

      const middleware = middlewares[i]

      if (!middleware) {
        await handler(context)
        return
      }

      await middleware(context, () => dispatch(i + 1))
    }

    await dispatch(0)
  }
}

type WsRoute = {
  type: string
  pipeline: WsHandler
}

export function createWsRouter(options: {
  services: Services
  middleware?: WsMiddleware[]
}) {
  const routes: WsRoute[] = []
  const globalMiddleware = options.middleware ?? []

  function on(
    type: string,
    config: {
      middleware?: WsMiddleware[]
      handler: WsHandler
    }
  ) {
    const pipeline = composeWs(
      [...globalMiddleware, ...(config.middleware ?? [])],
      config.handler
    )

    routes.push({
      type,
      pipeline,
    })
  }

  async function message(
    socket: WsSocket,
    raw: string | Buffer
  ): Promise<void> {
    const baseContext: WsContext = {
      socket,
      services: options.services,

      raw,
      message: undefined,

      socketId: socket.data.socketId,
      userId: socket.data.userId,
      roomId: socket.data.roomId,

      state: socket.data.state,
    }

    const pipeline = composeWs(
      [
        wsErrorBoundary(),
        parseWsJson(),
        async (context, next) => {
          const message = context.message

          if (!isRecord(message)) {
            sendWsError(
              context.socket,
              "invalid_message",
              "Message must be object"
            )
            return
          }

          if (typeof message.type !== "string") {
            sendWsError(
              context.socket,
              "invalid_type",
              "Message type is required"
            )
            return
          }

          const route = routes.find((route) => route.type === message.type)

          if (!route) {
            sendWsError(
              context.socket,
              "unknown_message",
              "Unknown message type"
            )
            return
          }

          await route.pipeline(context)
        },
      ],
      async () => {}
    )

    await pipeline(baseContext)
  }

  async function close(socket: WsSocket): Promise<void> {
    try {
      await options.services.rooms.handleClose(socket)
    } catch (error) {
      console.error("WebSocket close error", error)
    }
  }

  return {
    on,
    message,
    close,
  }
}
