import type { ArrangeLoosePiecesMode } from "@jigtable/core/scatter"
import type { GroupId } from "@jigtable/core/types"

import { LIMITS } from "@/config"
import type {
  PlayerSessionReader,
  RoomHistory,
  RoomLogger,
  RoomMetrics,
  UpdateSessionPlayerInput,
} from "./contracts"
import { RoomCommands } from "./room-commands"
import type { RoomPublisher } from "./room-events"
import { createRoom } from "./room-factory"
import type { RoomStore } from "./redis-room-store"
import {
  releaseConnectionLocks,
  releasePlayerLocks,
  updatePlayerLocks,
} from "./room-locks"
import { toRoomSnapshot } from "./room-snapshot"
import type {
  CreateRoomInput,
  JoinedRoom,
  Player,
  Room,
  RoomSnapshot,
} from "./room.types"

type RoomManagerDependencies = {
  sessions: PlayerSessionReader
  history: RoomHistory
  publisher: RoomPublisher
  metrics: RoomMetrics
  store: RoomStore
  logger?: RoomLogger
  now?: () => number
}

export type JoinRoomResult = {
  roomId: string
  sessionToken: string
  player: Player
}

export class RoomManager {
  private readonly connectionRooms = new Map<string, Room>()
  private readonly pendingJoins = new Map<string, symbol>()
  private readonly participantHistoryOperations = new Map<
    string,
    Promise<void>
  >()
  private readonly commands: RoomCommands
  private readonly now: () => number
  private readonly logger: RoomLogger
  private persistenceTimer: ReturnType<typeof setInterval> | null = null

  constructor(private readonly dependencies: RoomManagerDependencies) {
    this.now = dependencies.now ?? Date.now
    this.logger = dependencies.logger ?? console
    this.commands = new RoomCommands(dependencies.publisher, { now: this.now })
  }

  start(): void {
    if (this.persistenceTimer) {
      return
    }

    this.persistenceTimer = setInterval(() => {
      void this.persistActiveRooms()
    }, LIMITS.jigsaw.cleanupIntervalMs)
  }

  stop(): void {
    if (!this.persistenceTimer) {
      return
    }

    clearInterval(this.persistenceTimer)
    this.persistenceTimer = null
  }

  async createRoom(input: CreateRoomInput): Promise<RoomSnapshot> {
    const room = createRoom(input, this.now())

    await this.dependencies.store.save(room)

    return toRoomSnapshot(room)
  }

  async getRoomSnapshot(roomId: string): Promise<RoomSnapshot | null> {
    const room =
      this.findActiveRoom(roomId) ?? (await this.dependencies.store.get(roomId))

    return room ? toRoomSnapshot(room) : null
  }

  async joinRoom(
    connectionId: string,
    input: {
      roomId: string
      sessionToken: string
    }
  ): Promise<JoinRoomResult | null> {
    const attempt = Symbol(connectionId)
    this.pendingJoins.set(connectionId, attempt)

    try {
      const session = await this.dependencies.sessions.get(input.sessionToken)

      if (this.pendingJoins.get(connectionId) !== attempt) {
        return null
      }

      if (!session) {
        this.dependencies.publisher.error(
          connectionId,
          "session_required",
          "Player session not found"
        )
        return null
      }

      const storedRoom = await this.dependencies.store.get(input.roomId)

      if (this.pendingJoins.get(connectionId) !== attempt) {
        return null
      }

      const room = this.findActiveRoom(input.roomId) ?? storedRoom

      if (!room) {
        this.dependencies.publisher.error(
          connectionId,
          "room_not_found",
          "Room not found or expired"
        )
        return null
      }

      const previousRoom = this.connectionRooms.get(connectionId)

      if (previousRoom) {
        await this.disconnect(connectionId)

        if (this.pendingJoins.get(connectionId) !== attempt) {
          return null
        }
      }

      const player = session.player
      const isNewPlayer = !room.players.has(player.id)

      room.connections.set(connectionId, {
        connectionId,
        sessionToken: session.token,
        playerId: player.id,
      })
      this.connectionRooms.set(connectionId, room)
      room.players.set(player.id, player)
      room.updatedAt = this.now()

      await this.dependencies.store.save(room)

      this.enqueueParticipantHistory(
        room.roomId,
        player.id,
        () =>
          this.dependencies.history.syncParticipant({
            roomId: room.roomId,
            session,
          }),
        "Room participant sync failed"
      )

      this.syncMetrics()

      this.dependencies.publisher.send(connectionId, {
        type: "room:state",
        state: toRoomSnapshot(room),
      })

      if (isNewPlayer) {
        this.dependencies.publisher.broadcastExcept(room.roomId, connectionId, {
          type: "player:joined",
          player,
          playersCount: room.players.size,
        })

        this.commands.publishStats(room)
      }

      return {
        roomId: room.roomId,
        sessionToken: session.token,
        player,
      }
    } finally {
      if (this.pendingJoins.get(connectionId) === attempt) {
        this.pendingJoins.delete(connectionId)
      }
    }
  }

  requestState(connectionId: string): void {
    const joined = this.getJoinedRoom(connectionId)

    if (!joined) {
      return
    }

    this.dependencies.publisher.send(connectionId, {
      type: "room:state",
      state: toRoomSnapshot(joined.room),
    })
  }

  async pause(connectionId: string): Promise<void> {
    const joined = this.getJoinedRoom(connectionId)

    if (joined) {
      this.commands.pause(joined.room, joined.player)
      await this.dependencies.store.save(joined.room)
    }
  }

  async resume(connectionId: string): Promise<void> {
    const joined = this.getJoinedRoom(connectionId)

    if (joined) {
      this.commands.resume(joined.room)
      await this.dependencies.store.save(joined.room)
    }
  }

  async grabGroup(connectionId: string, groupId: string): Promise<void> {
    const joined = this.getJoinedRoom(connectionId)

    if (joined) {
      this.commands.grabGroup(
        connectionId,
        joined.room,
        joined.player,
        groupId as GroupId
      )
      await this.dependencies.store.save(joined.room)
    }
  }

  async moveGroup(
    connectionId: string,
    input: {
      groupId: string
      x: number
      y: number
    }
  ): Promise<void> {
    const joined = this.getJoinedRoom(connectionId)

    if (joined) {
      this.commands.moveGroup(connectionId, joined.room, joined.player, {
        ...input,
        groupId: input.groupId as GroupId,
      })
    }
  }

  async dropGroup(
    connectionId: string,
    input: {
      groupId: string
      x: number
      y: number
    }
  ): Promise<void> {
    const joined = this.getJoinedRoom(connectionId)

    if (!joined) {
      return
    }

    const completion = this.commands.dropGroup(joined.room, joined.player, {
      ...input,
      groupId: input.groupId as GroupId,
    })

    await this.dependencies.store.save(joined.room)

    if (!completion) {
      return
    }

    void this.dependencies.history
      .recordCompletion({
        roomId: joined.room.roomId,
        assetRef: joined.room.assetRef,
        config: joined.room.state.config,
        imageUrl: joined.room.imageUrl,
        elapsedMs: completion.elapsedMs,
        pieceCount: completion.pieceCount,
        snapCount: completion.snapCount,
        completedAt: new Date(completion.completedAt),
      })
      .catch((error: unknown) => {
        this.logger.error("Room completion history failed", error)
      })
  }

  async releaseGroup(connectionId: string, groupId: string): Promise<void> {
    const joined = this.getJoinedRoom(connectionId)

    if (joined) {
      this.commands.releaseGroup(joined.room, joined.player, groupId as GroupId)
      await this.dependencies.store.save(joined.room)
    }
  }

  async arrangeGroups(
    connectionId: string,
    mode: ArrangeLoosePiecesMode
  ): Promise<void> {
    const joined = this.getJoinedRoom(connectionId)

    if (joined) {
      this.commands.arrangeGroups(joined.room, mode)
      await this.dependencies.store.save(joined.room)
    }
  }

  async toggleLock(
    connectionId: string,
    input: {
      targetType: "piece" | "group"
      targetId: string
    }
  ): Promise<void> {
    const joined = this.getJoinedRoom(connectionId)

    if (joined) {
      this.commands.toggleLock(connectionId, joined.room, joined.player, input)
      await this.dependencies.store.save(joined.room)
    }
  }

  ping(
    connectionId: string,
    input: {
      id: string
      x: number
      y: number
    }
  ): void {
    const joined = this.getJoinedRoom(connectionId)

    if (joined) {
      this.commands.ping(joined.room, joined.player, input)
    }
  }

  moveCursor(
    connectionId: string,
    input: {
      x: number
      y: number
    }
  ): void {
    const joined = this.getJoinedRoom(connectionId)

    if (joined) {
      this.commands.moveCursor(
        connectionId,
        joined.room,
        joined.player,
        input.x,
        input.y
      )
    }
  }

  hideCursor(connectionId: string): void {
    const joined = this.getJoinedRoom(connectionId)

    if (joined) {
      this.commands.hideCursor(connectionId, joined.room, joined.player.id)
    }
  }

  async disconnect(connectionId: string): Promise<void> {
    const room = this.connectionRooms.get(connectionId)

    if (!room) {
      return
    }

    this.connectionRooms.delete(connectionId)

    const connection = room.connections.get(connectionId)

    room.connections.delete(connectionId)

    releaseConnectionLocks(room, connectionId, this.dependencies.publisher)

    if (!connection) {
      await this.dependencies.store.save(room)
      this.syncMetrics()
      return
    }

    const playerStillConnected = [...room.connections.values()].some(
      (item) => item.playerId === connection.playerId
    )

    if (playerStillConnected) {
      await this.dependencies.store.save(room)
      this.syncMetrics()
      return
    }

    room.players.delete(connection.playerId)
    room.cursors.delete(connection.playerId)
    releasePlayerLocks(room, connection.playerId, this.dependencies.publisher)
    room.updatedAt = this.now()

    await this.dependencies.store.save(room)

    this.dependencies.publisher.broadcast(room.roomId, {
      type: "cursor:hidden",
      playerId: connection.playerId,
    })

    this.dependencies.publisher.broadcast(room.roomId, {
      type: "player:left",
      playerId: connection.playerId,
      playersCount: room.players.size,
    })

    this.commands.publishStats(room)
    this.syncMetrics()

    this.enqueueParticipantHistory(
      room.roomId,
      connection.playerId,
      () =>
        this.dependencies.history.markParticipantLeft(
          room.roomId,
          connection.playerId
        ),
      "Room participant leave failed"
    )
  }

  async closeConnection(connectionId: string): Promise<void> {
    this.pendingJoins.delete(connectionId)
    await this.disconnect(connectionId)
  }

  async updateSessionPlayer({
    sessionToken,
    player,
  }: UpdateSessionPlayerInput): Promise<void> {
    const session = await this.dependencies.sessions.get(sessionToken)

    for (const room of new Set(this.connectionRooms.values())) {
      const matchingConnections = [...room.connections.values()].filter(
        (connection) => connection.sessionToken === sessionToken
      )

      if (matchingConnections.length === 0) {
        continue
      }

      room.players.set(player.id, player)
      updatePlayerLocks(room, player)

      const cursor = room.cursors.get(player.id)

      if (cursor) {
        const updatedCursor = {
          ...cursor,
          playerName: player.name,
          color: player.color,
          updatedAt: this.now(),
        }

        room.cursors.set(player.id, updatedCursor)

        this.dependencies.publisher.broadcast(room.roomId, {
          type: "cursor:moved",
          cursor: updatedCursor,
        })
      }

      room.updatedAt = this.now()

      await this.dependencies.store.save(room)

      this.enqueueParticipantHistory(
        room.roomId,
        player.id,
        () =>
          this.dependencies.history.updateParticipantProfile({
            sessionToken,
            profile: {
              name: player.name,
              color: player.color,
            },
            userId: session?.userId,
          }),
        "Room participant profile sync failed"
      )

      this.dependencies.publisher.broadcast(room.roomId, {
        type: "player:updated",
        player,
      })

      this.commands.publishStats(room)
    }
  }

  private getJoinedRoom(connectionId: string): JoinedRoom | null {
    const room = this.connectionRooms.get(connectionId)
    const connection = room?.connections.get(connectionId)
    const player = connection ? room?.players.get(connection.playerId) : null

    if (!room || !connection || !player) {
      this.dependencies.publisher.error(
        connectionId,
        "not_joined",
        "Join room first"
      )
      return null
    }

    return {
      room,
      connection,
      player,
    }
  }

  private enqueueParticipantHistory(
    roomId: string,
    playerId: string,
    operation: () => Promise<void>,
    failureMessage: string
  ): void {
    const key = `${roomId}:${playerId}`
    const previous = this.participantHistoryOperations.get(key)
    const current = (
      previous?.catch(() => undefined) ?? Promise.resolve()
    ).then(operation)

    this.participantHistoryOperations.set(key, current)

    void current
      .catch((error: unknown) => {
        this.logger.error(failureMessage, error)
      })
      .finally(() => {
        if (this.participantHistoryOperations.get(key) === current) {
          this.participantHistoryOperations.delete(key)
        }
      })
  }

  private syncMetrics(): void {
    let players = 0
    const rooms = new Set(this.connectionRooms.values())

    for (const room of rooms) {
      players += room.players.size
    }

    this.dependencies.metrics.setActiveRooms(rooms.size)
    this.dependencies.metrics.setActivePlayers(players)
  }

  private findActiveRoom(roomId: string): Room | null {
    for (const room of this.connectionRooms.values()) {
      if (room.roomId === roomId) {
        return room
      }
    }

    return null
  }

  private async persistActiveRooms(): Promise<void> {
    await Promise.all(
      [...new Set(this.connectionRooms.values())].map((room) =>
        this.dependencies.store.save(room)
      )
    ).catch((error: unknown) => {
      this.logger.error("Active room persistence failed", error)
    })
  }
}
