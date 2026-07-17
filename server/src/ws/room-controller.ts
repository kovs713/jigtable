import type { Player } from "@jigtable/core/protocol"
import type { ArrangeLoosePiecesMode } from "@jigtable/core/scatter"

import type { RoomManager } from "@/services/room"
import type { WsSocket } from "@/ws/types"

import type { RoomSocketRegistry } from "./room-socket-registry"

export class RoomController {
  constructor(
    private readonly rooms: RoomManager,
    private readonly sockets: RoomSocketRegistry
  ) {}

  open(socket: WsSocket): void {
    this.sockets.register(socket)
  }

  async handleRoomJoin(
    socket: WsSocket,
    input: {
      roomId: string
      sessionToken: string
    }
  ): Promise<void> {
    const connectionId = this.requireConnectionId(socket)
    let joined

    try {
      joined = await this.rooms.joinRoom(connectionId, input)
    } catch (error) {
      this.clearRoomContext(socket)
      throw error
    }

    if (!joined) {
      return
    }

    socket.data.roomId = joined.roomId
    socket.data.sessionToken = joined.sessionToken
    socket.data.player = joined.player
  }

  handleRoomRequestState(socket: WsSocket): void {
    this.rooms.requestState(this.requireConnectionId(socket))
  }

  handleSessionPause(socket: WsSocket): void {
    this.rooms.pause(this.requireConnectionId(socket))
  }

  handleSessionResume(socket: WsSocket): void {
    this.rooms.resume(this.requireConnectionId(socket))
  }

  handleGroupGrab(socket: WsSocket, input: { groupId: string }): void {
    this.rooms.grabGroup(this.requireConnectionId(socket), input.groupId)
  }

  handleGroupMove(
    socket: WsSocket,
    input: {
      groupId: string
      x: number
      y: number
    }
  ): void {
    this.rooms.moveGroup(this.requireConnectionId(socket), input)
  }

  handleGroupDrop(
    socket: WsSocket,
    input: {
      groupId: string
      x: number
      y: number
    }
  ): void {
    this.rooms.dropGroup(this.requireConnectionId(socket), input)
  }

  handleGroupRelease(socket: WsSocket, input: { groupId: string }): void {
    this.rooms.releaseGroup(this.requireConnectionId(socket), input.groupId)
  }

  handleGroupsArrange(
    socket: WsSocket,
    input: {
      mode: ArrangeLoosePiecesMode
    }
  ): void {
    this.rooms.arrangeGroups(this.requireConnectionId(socket), input.mode)
  }

  handleRoomLockToggle(
    socket: WsSocket,
    input: {
      targetType: "piece" | "group"
      targetId: string
    }
  ): void {
    this.rooms.toggleLock(this.requireConnectionId(socket), input)
  }

  handleRoomPing(
    socket: WsSocket,
    input: {
      id: string
      x: number
      y: number
    }
  ): void {
    this.rooms.ping(this.requireConnectionId(socket), input)
  }

  handleCursorMove(
    socket: WsSocket,
    input: {
      x: number
      y: number
    }
  ): void {
    this.rooms.moveCursor(this.requireConnectionId(socket), input)
  }

  handleCursorHide(socket: WsSocket): void {
    this.rooms.hideCursor(this.requireConnectionId(socket))
  }

  async handleClose(socket: WsSocket): Promise<void> {
    const connectionId = socket.data.connectionId

    if (!connectionId) {
      return
    }

    this.sockets.unregister(connectionId)

    await this.rooms.closeConnection(connectionId)

    this.clearRoomContext(socket)
  }

  updateSessionPlayer(sessionToken: string, player: Player): Promise<void> {
    return this.rooms.updateSessionPlayer({
      sessionToken,
      player,
    })
  }

  private requireConnectionId(socket: WsSocket): string {
    return socket.data.connectionId ?? this.sockets.register(socket)
  }

  private clearRoomContext(socket: WsSocket): void {
    socket.data.roomId = undefined
    socket.data.sessionToken = undefined
    socket.data.player = undefined
  }
}
