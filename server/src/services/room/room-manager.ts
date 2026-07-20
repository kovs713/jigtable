import type { ArrangeLoosePiecesMode } from "@jigtable/core/scatter"
import type {
  PersistedRoomEvent,
  RoomEventDraft,
} from "@jigtable/core/session-history"
import type { GroupId } from "@jigtable/core/types"

import { LIMITS } from "@/config"
import type {
  PlayerSessionReader,
  RoomEventStore,
  RoomHistory,
  RoomLogger,
  RoomMetrics,
  UpdateSessionPlayerInput,
} from "./contracts"
import { RoomCommands, type DropGroupOutcome } from "./room-commands"
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
  events: RoomEventStore
  history: RoomHistory
  publisher: RoomPublisher
  metrics: RoomMetrics
  store: RoomStore
  logger?: RoomLogger
  now?: () => number
}

type RoomMutationSnapshot = Pick<
  Room,
  | "state"
  | "dragLocks"
  | "toggleLocks"
  | "timer"
  | "completedAt"
  | "updatedAt"
  | "activePreviews"
>

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
  private readonly roomCommandOperations = new Map<string, Promise<void>>()
  private readonly pendingRoomEventBatches: RoomEventDraft[][] = []
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
    void this.dependencies.history
      .recoverPendingCompletions()
      .catch((error) => {
        this.logger.error("Pending room finalization failed", error)
      })
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

      const activeRoom = this.findActiveRoom(input.roomId)
      const room = activeRoom ?? storedRoom

      if (!room) {
        this.dependencies.publisher.error(
          connectionId,
          "room_not_found",
          "Room not found or expired"
        )
        return null
      }

      if (!activeRoom && room.completedAt === undefined) {
        await this.restoreCompletionFromEvents(room)
      }
      if (!activeRoom && room.completedAt !== undefined) {
        await this.dependencies.store.save(room)
        await this.finalizeCompletedRoom(room)
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
      const presenceId = crypto.randomUUID()

      room.connections.set(connectionId, {
        connectionId,
        sessionToken: session.token,
        playerId: player.id,
        userId: session.userId ?? null,
        presenceId,
      })
      this.connectionRooms.set(connectionId, room)
      room.players.set(player.id, player)
      room.updatedAt = this.now()

      await this.appendRoomEvents([
        {
          roomId: room.roomId,
          commandId: crypto.randomUUID(),
          eventIndex: 0,
          eventType: "player_connected",
          playerId: player.id,
          userId: session.userId ?? null,
          payload: { presenceId },
        },
      ])
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
      commandId: string
      groupId: string
      x: number
      y: number
    }
  ): Promise<void> {
    await this.runRoomCommand(connectionId, () =>
      this.dropGroupCommand(connectionId, input)
    )
  }

  private async dropGroupCommand(
    connectionId: string,
    input: {
      commandId: string
      groupId: string
      x: number
      y: number
    }
  ): Promise<void> {
    const joined = this.getJoinedRoom(connectionId)

    if (!joined) {
      return
    }

    await this.flushPendingRoomEvents(joined.room.roomId, true)

    const replay = await this.dependencies.events.findByCommand(
      joined.room.roomId,
      input.commandId
    )

    if (replay.length > 0) {
      if (replay.some((event) => event.eventType === "room_completed")) {
        await this.finalizeCompletedRoom(joined.room)
      }
      this.requestState(connectionId)
      return
    }

    const before = this.captureRoomMutation(joined.room)
    let eventCommitted = false

    try {
      const outcome = this.commands.dropGroup(joined.room, joined.player, {
        ...input,
        groupId: input.groupId as GroupId,
      })

      if (!outcome) {
        await this.appendRoomEvents([
          this.createNoopEvent(joined, input.commandId, "rejected"),
        ])
        eventCommitted = true
        await this.dependencies.store.save(joined.room)
        return
      }

      const drafts = this.createDropEvents(joined, input.commandId, outcome)

      await this.appendRoomEvents(
        drafts.length > 0
          ? drafts
          : [this.createNoopEvent(joined, input.commandId, "no_snap")]
      )
      eventCommitted = true

      await this.dependencies.store.save(joined.room)

      if (!outcome.completion) return
      await this.finalizeCompletedRoom(joined.room)
    } catch (error) {
      if (!eventCommitted) {
        this.restoreRoomMutation(joined.room, before)
        this.dependencies.publisher.broadcast(joined.room.roomId, {
          type: "room:state",
          state: toRoomSnapshot(joined.room),
        })
      }
      throw error
    }
  }

  async togglePreview(
    connectionId: string,
    open: boolean,
    commandId: string
  ): Promise<void> {
    await this.runRoomCommand(connectionId, () =>
      this.togglePreviewCommand(connectionId, open, commandId)
    )
  }

  private async togglePreviewCommand(
    connectionId: string,
    open: boolean,
    commandId: string
  ): Promise<void> {
    const joined = this.getJoinedRoom(connectionId)

    if (!joined) return
    if (joined.room.completedAt !== undefined) return

    const replay = await this.dependencies.events.findByCommand(
      joined.room.roomId,
      commandId
    )

    if (replay.length > 0) return

    const active = joined.room.activePreviews.get(connectionId)

    if (open) {
      if (active) {
        await this.appendRoomEvents([
          this.createNoopEvent(joined, commandId, "already_open"),
        ])
        return
      }

      const intervalId = crypto.randomUUID()
      const preview = {
        presenceId: joined.connection.presenceId,
        intervalId,
        playerId: joined.player.id,
        userId: joined.connection.userId,
      }

      await this.appendRoomEvents([
        {
          roomId: joined.room.roomId,
          commandId,
          eventIndex: 0,
          eventType: "preview_opened",
          playerId: preview.playerId,
          userId: preview.userId,
          payload: {
            presenceId: preview.presenceId,
            intervalId,
          },
        },
      ])

      if (
        joined.room.connections.get(connectionId)?.presenceId !==
        preview.presenceId
      ) {
        await this.appendRoomEvents([
          {
            roomId: joined.room.roomId,
            commandId: crypto.randomUUID(),
            eventIndex: 0,
            eventType: "preview_closed",
            playerId: preview.playerId,
            userId: preview.userId,
            payload: {
              presenceId: preview.presenceId,
              intervalId,
              reason: "disconnect",
            },
          },
        ])
        return
      }
      joined.room.activePreviews.set(connectionId, preview)
      return
    }

    if (!active) {
      await this.appendRoomEvents([
        this.createNoopEvent(joined, commandId, "not_open"),
      ])
      return
    }

    await this.appendRoomEvents([
      {
        roomId: joined.room.roomId,
        commandId,
        eventIndex: 0,
        eventType: "preview_closed",
        playerId: active.playerId,
        userId: active.userId,
        payload: {
          presenceId: active.presenceId,
          intervalId: active.intervalId,
          reason: "client",
        },
      },
    ])
    joined.room.activePreviews.delete(connectionId)
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
      commandId: string
      targetType: "piece" | "group"
      targetId: string
    }
  ): Promise<void> {
    await this.runRoomCommand(connectionId, () =>
      this.toggleLockCommand(connectionId, input)
    )
  }

  private async toggleLockCommand(
    connectionId: string,
    input: {
      commandId: string
      targetType: "piece" | "group"
      targetId: string
    }
  ): Promise<void> {
    const joined = this.getJoinedRoom(connectionId)

    if (!joined) return
    if (joined.room.completedAt !== undefined) return

    const replay = await this.dependencies.events.findByCommand(
      joined.room.roomId,
      input.commandId
    )

    if (replay.length > 0) return

    const before = this.captureRoomMutation(joined.room)
    let eventCommitted = false

    try {
      const outcome = this.commands.toggleLock(
        connectionId,
        joined.room,
        joined.player,
        input
      )

      if (outcome) {
        await this.appendRoomEvents([
          {
            roomId: joined.room.roomId,
            commandId: input.commandId,
            eventIndex: 0,
            eventType: outcome.locked ? "group_locked" : "group_unlocked",
            playerId: joined.player.id,
            userId: joined.connection.userId,
            payload: outcome.locked
              ? {
                  groupId: outcome.groupId,
                  pieceIds: outcome.pieceIds,
                }
              : {
                  groupId: outcome.groupId,
                  pieceIds: outcome.pieceIds,
                  reason: "client",
                },
          } as RoomEventDraft,
        ])
      } else {
        await this.appendRoomEvents([
          this.createNoopEvent(joined, input.commandId, "rejected"),
        ])
      }

      eventCommitted = true
      await this.dependencies.store.save(joined.room)
    } catch (error) {
      if (!eventCommitted) {
        this.restoreRoomMutation(joined.room, before)
        this.dependencies.publisher.broadcast(joined.room.roomId, {
          type: "room:state",
          state: toRoomSnapshot(joined.room),
        })
      }
      throw error
    }
  }

  async ping(
    connectionId: string,
    input: {
      commandId: string
      id: string
      x: number
      y: number
    }
  ): Promise<void> {
    await this.runRoomCommand(connectionId, () =>
      this.pingCommand(connectionId, input)
    )
  }

  private async pingCommand(
    connectionId: string,
    input: {
      commandId: string
      id: string
      x: number
      y: number
    }
  ): Promise<void> {
    const joined = this.getJoinedRoom(connectionId)

    if (!joined) return
    if (joined.room.completedAt !== undefined) return

    const replay = await this.dependencies.events.findByCommand(
      joined.room.roomId,
      input.commandId
    )

    if (replay.length > 0) return

    const createdAt = this.commands.ping(joined.room, joined.player, input)

    if (createdAt === null) {
      await this.appendRoomEvents([
        this.createNoopEvent(joined, input.commandId, "cooldown"),
      ])
      return
    }

    try {
      await this.appendRoomEvents([
        {
          roomId: joined.room.roomId,
          commandId: input.commandId,
          eventIndex: 0,
          eventType: "ping_created",
          playerId: joined.player.id,
          userId: joined.connection.userId,
          payload: {
            pingId: input.id,
            x: input.x,
            y: input.y,
            expiresAt: new Date(
              createdAt + LIMITS.jigsaw.pingTtlMs
            ).toISOString(),
          },
        },
      ])
    } catch (error) {
      joined.room.pingCooldowns.delete(joined.player.id)
      throw error
    }

    this.dependencies.publisher.broadcast(joined.room.roomId, {
      type: "room:pinged",
      id: input.id,
      userId: joined.player.id,
      userName: joined.player.name,
      userColor: joined.player.color,
      x: input.x,
      y: input.y,
      createdAt,
    })
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
    await this.runRoomCommand(connectionId, () =>
      this.disconnectCommand(connectionId)
    )
  }

  private async disconnectCommand(connectionId: string): Promise<void> {
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

    const commandId = crypto.randomUUID()
    const lifecycleEvents: RoomEventDraft[] = []
    const preview = room.activePreviews.get(connectionId)

    if (preview) {
      lifecycleEvents.push({
        roomId: room.roomId,
        commandId,
        eventIndex: lifecycleEvents.length,
        eventType: "preview_closed",
        playerId: preview.playerId,
        userId: preview.userId,
        payload: {
          presenceId: preview.presenceId,
          intervalId: preview.intervalId,
          reason: "disconnect",
        },
      })
      room.activePreviews.delete(connectionId)
    }

    lifecycleEvents.push({
      roomId: room.roomId,
      commandId,
      eventIndex: lifecycleEvents.length,
      eventType: "player_disconnected",
      playerId: connection.playerId,
      userId: connection.userId,
      payload: {
        presenceId: connection.presenceId,
        reason: "disconnect",
      },
    })
    try {
      await this.appendRoomEvents(lifecycleEvents)
    } catch (error) {
      this.pendingRoomEventBatches.push([...lifecycleEvents])
      this.logger.error("Room disconnect events failed", error)
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

  private createDropEvents(
    joined: JoinedRoom,
    commandId: string,
    outcome: DropGroupOutcome
  ): RoomEventDraft[] {
    const { room, player, connection } = joined
    const { snap, completion } = outcome

    if (snap.kind === "none") return []

    const actionEventId = crypto.randomUUID()
    const events: RoomEventDraft[] = [
      snap.kind === "neighbor"
        ? {
            id: actionEventId,
            roomId: room.roomId,
            commandId,
            eventIndex: 0,
            eventType:
              snap.movingPieceIds.length === 1
                ? "piece_joined"
                : "group_joined",
            playerId: player.id,
            userId: connection.userId,
            payload: {
              movingGroupId: snap.movingGroupId,
              targetGroupId: snap.targetGroupId,
              resultGroupId: snap.resultGroupId,
              movingPieceIds: snap.movingPieceIds,
              targetPieceIds: snap.targetPieceIds,
            },
          }
        : {
            id: actionEventId,
            roomId: room.roomId,
            commandId,
            eventIndex: 0,
            eventType: "group_snapped",
            playerId: player.id,
            userId: connection.userId,
            payload: {
              groupId: snap.groupId,
              pieceIds: snap.pieceIds,
            },
          },
    ]

    if (!completion) return events

    for (const [connectionId, preview] of room.activePreviews) {
      events.push({
        roomId: room.roomId,
        commandId,
        eventIndex: events.length,
        eventType: "preview_closed",
        playerId: preview.playerId,
        userId: preview.userId,
        payload: {
          presenceId: preview.presenceId,
          intervalId: preview.intervalId,
          reason: "room_completed",
        },
      })
      room.activePreviews.delete(connectionId)
    }

    events.push({
      roomId: room.roomId,
      commandId,
      eventIndex: events.length,
      eventType: "room_completed",
      playerId: null,
      userId: null,
      payload: {
        triggerEventId: actionEventId,
        completedAt: new Date(completion.completedAt).toISOString(),
        elapsedMs: completion.elapsedMs,
        pieceCount: completion.pieceCount,
        snapCount: completion.snapCount,
        jigsawConfig: room.state.config,
        assetRef: room.assetRef,
        imageUrl: room.imageUrl,
      },
    })

    return events
  }

  private createNoopEvent(
    joined: JoinedRoom,
    commandId: string,
    reason: "already_open" | "not_open" | "cooldown" | "rejected" | "no_snap"
  ): RoomEventDraft {
    return {
      roomId: joined.room.roomId,
      commandId,
      eventIndex: 0,
      eventType: "command_noop",
      playerId: joined.player.id,
      userId: joined.connection.userId,
      payload: { reason },
    }
  }

  private captureRoomMutation(room: Room): RoomMutationSnapshot {
    return structuredClone({
      state: room.state,
      dragLocks: room.dragLocks,
      toggleLocks: room.toggleLocks,
      timer: room.timer,
      completedAt: room.completedAt,
      updatedAt: room.updatedAt,
      activePreviews: room.activePreviews,
    })
  }

  private restoreRoomMutation(
    room: Room,
    snapshot: RoomMutationSnapshot
  ): void {
    room.state = snapshot.state
    room.dragLocks = snapshot.dragLocks
    room.toggleLocks = snapshot.toggleLocks
    room.timer = snapshot.timer
    room.completedAt = snapshot.completedAt
    room.updatedAt = snapshot.updatedAt
    room.activePreviews = snapshot.activePreviews
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

  private async awaitParticipantHistory(roomId: string): Promise<void> {
    const prefix = `${roomId}:`
    const pending = [...this.participantHistoryOperations.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([, operation]) => operation)

    await Promise.all(pending)
  }

  private async appendRoomEvents(
    drafts: readonly RoomEventDraft[]
  ): Promise<PersistedRoomEvent[]> {
    try {
      return await this.dependencies.events.append(drafts)
    } catch {
      // A repeated append validates the persisted batch after a lost response.
      return this.dependencies.events.append(drafts)
    }
  }

  private async runRoomCommand(
    connectionId: string,
    operation: () => Promise<void>
  ): Promise<void> {
    const room = this.connectionRooms.get(connectionId)

    if (!room) {
      this.getJoinedRoom(connectionId)
      return
    }

    const presenceId = room.connections.get(connectionId)?.presenceId

    await this.runRoomOperation(room.roomId, async () => {
      const currentRoom = this.connectionRooms.get(connectionId)
      const currentPresenceId =
        currentRoom?.connections.get(connectionId)?.presenceId

      if (currentRoom !== room || currentPresenceId !== presenceId) return
      await operation()
    })
  }

  private async runRoomOperation(
    roomId: string,
    operation: () => Promise<void>
  ): Promise<void> {
    const previous = this.roomCommandOperations.get(roomId)
    const current = (
      previous?.catch(() => undefined) ?? Promise.resolve()
    ).then(operation)
    this.roomCommandOperations.set(roomId, current)

    try {
      await current
    } finally {
      if (this.roomCommandOperations.get(roomId) === current) {
        this.roomCommandOperations.delete(roomId)
      }
    }
  }

  private async finalizeCompletedRoom(room: Room): Promise<void> {
    if (room.completedAt === undefined) return

    await this.awaitParticipantHistory(room.roomId)
    await this.dependencies.history.recordCompletion({
      roomId: room.roomId,
      assetRef: room.assetRef,
      config: room.state.config,
      imageUrl: room.imageUrl,
      elapsedMs: room.timer.elapsedMs,
      pieceCount: Object.keys(room.state.pieces).length,
      snapCount: room.state.snapCount,
      completedAt: new Date(room.completedAt),
    })
  }

  private async restoreCompletionFromEvents(room: Room): Promise<void> {
    const events = await this.dependencies.events.listRoomEvents(room.roomId)
    const completion = events.findLast(
      (event) => event.eventType === "room_completed"
    )

    if (!completion || completion.eventType !== "room_completed") return

    const pieceIds = Object.keys(room.state.pieces)
    const completedGroupId = "group-completed"

    for (const pieceId of pieceIds) {
      const piece = room.state.pieces[pieceId]
      const definition = room.state.definitions[pieceId]
      if (!piece || !definition) continue

      piece.groupId = completedGroupId
      piece.x = definition.correctX
      piece.y = definition.correctY
      piece.placed = true
      piece.locked = true
    }

    room.state.groups = {
      [completedGroupId]: {
        id: completedGroupId,
        pieceIds,
        locked: true,
      },
    }
    room.state.snapCount = completion.payload.snapCount
    room.completedAt = Date.parse(completion.payload.completedAt)
    room.timer = {
      elapsedMs: completion.payload.elapsedMs,
      paused: true,
      updatedAt: room.completedAt,
    }
    room.updatedAt = room.completedAt
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
    await this.flushPendingRoomEvents()
    await Promise.all(
      [...new Set(this.connectionRooms.values())].map(async (room) => {
        await this.runRoomOperation(room.roomId, async () => {
          await this.dependencies.store.save(room)
          await this.finalizeCompletedRoom(room)
        })
      })
    ).catch((error: unknown) => {
      this.logger.error("Active room persistence failed", error)
    })
    await this.dependencies.history
      .recoverPendingCompletions()
      .catch((error) => {
        this.logger.error("Pending room finalization failed", error)
      })
  }

  private async flushPendingRoomEvents(
    roomId?: string,
    required = false
  ): Promise<void> {
    const selected: RoomEventDraft[][] = []
    const retained: RoomEventDraft[][] = []

    for (const batch of this.pendingRoomEventBatches.splice(0)) {
      if (!roomId || batch[0]?.roomId === roomId) selected.push(batch)
      else retained.push(batch)
    }
    this.pendingRoomEventBatches.push(...retained)
    let failure: unknown = null

    for (const batch of selected) {
      try {
        await this.appendRoomEvents(batch)
      } catch (error) {
        this.pendingRoomEventBatches.push(batch)
        this.logger.error("Pending room events failed", error)
        failure ??= error
      }
    }

    if (required && failure) throw failure
  }
}
