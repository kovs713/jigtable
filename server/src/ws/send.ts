import type { ServerToClientMessage } from "@jigtable/core/protocol"
import { isRecord } from "@jigtable/shared/utils"

import {
  normalizeWsEvent,
  payloadByteLength,
  wsBroadcastFanoutTotal,
  wsMessageErrorsTotal,
  wsMessagesOutTotal,
  wsPayloadBytes,
} from "@/observability/metrics"
import type { WsSocket } from "./types"

type RoomLike = {
  sockets: Set<WsSocket>
}

export function sendJson(socket: WsSocket, value: unknown): void {
  const event = normalizeWsEvent(
    isRecord(value) && typeof value.type === "string" ? value.type : "unknown"
  )
  const body = JSON.stringify(value)

  wsMessagesOutTotal.inc({ event })
  wsPayloadBytes.observe({ direction: "out", event }, payloadByteLength(body))

  try {
    const result = socket.send(body)

    if (result === 0) {
      wsMessageErrorsTotal.inc({ event, reason: "send_dropped" })
      console.warn("WebSocket message dropped")
    }

    if (result === -1) {
      wsMessageErrorsTotal.inc({ event, reason: "backpressure" })
      console.warn("WebSocket backpressure")
    }
  } catch {
    wsMessageErrorsTotal.inc({ event, reason: "send_error" })
  }
}

export function sendWsError(
  socket: WsSocket,
  code: string,
  message: string
): void {
  sendJson(socket, {
    type: "error",
    code,
    message,
  })
}

export function sendRoomMessage(
  socket: WsSocket,
  message: ServerToClientMessage
): void {
  sendJson(socket, message)
}

export function broadcast(
  room: RoomLike,
  message: ServerToClientMessage
): void {
  const event = normalizeWsEvent(message.type)
  const recipients = room.sockets.size

  wsBroadcastFanoutTotal.inc({ event }, recipients)

  for (const socket of room.sockets) {
    sendJson(socket, message)
  }
}

export function broadcastExcept(
  room: RoomLike,
  except: WsSocket,
  message: ServerToClientMessage
): void {
  const event = normalizeWsEvent(message.type)
  let recipients = 0

  for (const socket of room.sockets) {
    if (socket !== except) {
      recipients++
    }
  }

  wsBroadcastFanoutTotal.inc({ event }, recipients)

  for (const socket of room.sockets) {
    if (socket !== except) {
      sendJson(socket, message)
    }
  }
}
