import { isRecord } from "@jigtable/shared/utils"

import {
  normalizeWsDisconnectReason,
  normalizeWsEvent,
  payloadByteLength,
  wsConnectionsCurrent,
  wsDisconnectsTotal,
  wsMessageErrorsTotal,
  wsMessageHandleDuration,
  wsMessagesInTotal,
  wsPayloadBytes,
} from "@/observability/metrics"
import type { Services } from "@/services"
import type { RoomController } from "./room-controller"
import { routeWsMessage } from "./routes"
import { sendWsError } from "./send"
import type { WsContext, WsHandler, WsMiddleware, WsSocket } from "./types"

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

const activeWsSockets = new WeakSet<WsSocket>()
let activeWsConnections = 0

function trackWsOpen(socket: WsSocket): void {
  if (activeWsSockets.has(socket)) {
    return
  }

  activeWsSockets.add(socket)
  activeWsConnections += 1

  wsConnectionsCurrent.set(activeWsConnections)
}

function trackWsClose(socket: WsSocket): boolean {
  if (!activeWsSockets.has(socket)) {
    return false
  }

  activeWsSockets.delete(socket)
  activeWsConnections = Math.max(0, activeWsConnections - 1)

  wsConnectionsCurrent.set(activeWsConnections)

  return true
}

export function createWsRouter(options: {
  services: Services
  roomController: RoomController
  middleware?: WsMiddleware[]
}) {
  const messageHandler: WsHandler = async (context) => {
    const message = context.message

    if (!isRecord(message) || typeof message.type !== "string") {
      wsMessageErrorsTotal.inc({
        event: "unknown",
        reason: "invalid_payload",
      })

      sendWsError(context.socket, "invalid_type", "Message type is required")
      return
    }

    const event = normalizeWsEvent(message.type)

    wsMessagesInTotal.inc({ event })
    wsPayloadBytes.observe(
      { direction: "in", event },
      payloadByteLength(context.raw)
    )

    const endTimer = wsMessageHandleDuration.startTimer({ event })

    try {
      await routeWsMessage(context)
    } catch (error) {
      wsMessageErrorsTotal.inc({
        event,
        reason: "handler_error",
      })

      throw error
    } finally {
      endTimer()
    }
  }

  const messagePipeline = composeWs(
    [
      errorBoundaryMiddleware,
      parseJsonMiddleware,
      ...(options.middleware ?? []),
    ],
    messageHandler
  )

  function open(socket: WsSocket): void {
    trackWsOpen(socket)
    options.roomController.open(socket)
  }

  async function message(
    socket: WsSocket,
    raw: string | Buffer
  ): Promise<void> {
    const context: WsContext = {
      socket,
      raw,
      services: options.services,
      roomController: options.roomController,
    }

    await messagePipeline(context)
  }

  async function close(socket: WsSocket, code = 1000): Promise<void> {
    const wasTracked = trackWsClose(socket)

    if (wasTracked) {
      wsDisconnectsTotal.inc({
        reason: normalizeWsDisconnectReason(
          code === 1000 ? "client_close" : "transport_error"
        ),
      })
    }

    try {
      await options.roomController.handleClose(socket)
    } catch (error) {
      console.error("WebSocket close error", error)
    }
  }

  return {
    open,
    message,
    close,
  }
}

const errorBoundaryMiddleware: WsMiddleware = async (context, next) => {
  try {
    await next()
  } catch (error) {
    console.error("WebSocket error", error)

    sendWsError(context.socket, "internal_error", "Internal error")
  }
}

const parseJsonMiddleware: WsMiddleware = async (context, next) => {
  if (typeof context.raw !== "string") {
    wsMessageErrorsTotal.inc({
      event: "unknown",
      reason: "invalid_payload",
    })

    sendWsError(context.socket, "invalid_message", "Message must be string")
    return
  }

  try {
    context.message = JSON.parse(context.raw)
  } catch {
    wsMessageErrorsTotal.inc({
      event: "unknown",
      reason: "invalid_payload",
    })

    sendWsError(context.socket, "invalid_json", "Invalid JSON")
    return
  }

  await next()
}

export type WsRouter = ReturnType<typeof createWsRouter>
