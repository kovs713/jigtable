import {
  normalizeWsEvent,
  wsBroadcastFanoutTotal,
} from "@/observability/metrics"
import { sendRoomMessage, sendWsError } from "@/ws/send"
import type { RoomErrorCode, RoomEvent, RoomPublisher } from "@/services/room"

import type { RoomSocketRegistry } from "./room-socket-registry"

export class WsRoomPublisher implements RoomPublisher {
  constructor(private readonly sockets: RoomSocketRegistry) {}

  send(connectionId: string, event: RoomEvent): void {
    const socket = this.sockets.get(connectionId)

    if (socket) {
      sendRoomMessage(socket, event)
    }
  }

  broadcast(roomId: string, event: RoomEvent): void {
    const sockets = this.sockets.getRoomSockets(roomId)

    wsBroadcastFanoutTotal.inc(
      { event: normalizeWsEvent(event.type) },
      sockets.length
    )

    for (const socket of sockets) {
      sendRoomMessage(socket, event)
    }
  }

  broadcastExcept(
    roomId: string,
    connectionId: string,
    event: RoomEvent
  ): void {
    const sockets = this.sockets
      .getRoomSockets(roomId)
      .filter((socket) => socket.data.connectionId !== connectionId)

    wsBroadcastFanoutTotal.inc(
      { event: normalizeWsEvent(event.type) },
      sockets.length
    )

    for (const socket of sockets) {
      sendRoomMessage(socket, event)
    }
  }

  error(connectionId: string, code: RoomErrorCode, message: string): void {
    const socket = this.sockets.get(connectionId)

    if (socket) {
      sendWsError(socket, code, message)
    }
  }
}
