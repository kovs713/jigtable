import type { ServerWebSocket } from "bun"

import type { Player as JigsawPlayer } from "@jigtable/core/protocol"

import type { Services } from "@/services"
import type { RoomController } from "./room-controller"

export type WsData = {
  connectionId: string
  roomId?: string
  sessionToken?: string
  player?: JigsawPlayer
}

export type WsSocket = ServerWebSocket<WsData>

export type WsContext = {
  socket: WsSocket
  services: Services
  roomController: RoomController
  raw: string | Buffer
  message?: unknown
}

export type WsHandler = (context: WsContext) => Promise<void> | void

export type WsMiddleware = (
  context: WsContext,
  next: () => Promise<void>
) => Promise<void>
