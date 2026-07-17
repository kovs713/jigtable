import type { WsSocket } from "@/ws/types"

export class RoomSocketRegistry {
  private readonly sockets = new Map<string, WsSocket>()

  register(socket: WsSocket): string {
    const connectionId = socket.data.connectionId ?? crypto.randomUUID()

    socket.data.connectionId = connectionId
    this.sockets.set(connectionId, socket)

    return connectionId
  }

  unregister(connectionId: string): void {
    this.sockets.delete(connectionId)
  }

  get(connectionId: string): WsSocket | undefined {
    return this.sockets.get(connectionId)
  }

  getRoomSockets(roomId: string): WsSocket[] {
    return [...this.sockets.values()].filter(
      (socket) => socket.data.roomId === roomId
    )
  }
}
