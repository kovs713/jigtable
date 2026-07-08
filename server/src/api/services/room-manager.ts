import type { ServerWebSocket } from "bun"

import {
  createImageJigsawConfig,
  JIGSAW_CONFIG_2000,
} from "@jigtable/jigsaw-core/jigsaw/config"
import { createJigsawState } from "@jigtable/jigsaw-core/jigsaw/generate-jigsaw"
import { moveGroupToAnchor } from "@jigtable/jigsaw-core/jigsaw/groups"
import type { ArrangeLoosePiecesMode } from "@jigtable/jigsaw-core/jigsaw/scatter"
import {
  arrangeLoosePieces,
  scatterAllPieces,
} from "@jigtable/jigsaw-core/jigsaw/scatter"
import { snapDroppedGroup } from "@jigtable/jigsaw-core/jigsaw/snap"
import type {
  GroupId,
  GroupState,
  JigsawState,
  PieceId,
  PieceState,
} from "@jigtable/jigsaw-core/jigsaw/types"
import type {
  ClientToServerMessage,
  JigsawGroupLock,
  JigsawLock,
  JigsawPlayer,
  JigsawPlayerCursor,
  JigsawRoomSnapshot,
  JigsawRoomStats,
  JigsawRoomTimer,
  ServerToClientMessage,
} from "@jigtable/jigsaw-core/multiplayer/protocol"

import { LIMITS } from "@/config"
import type { JigsawSafeAssetRef } from "@/infra/db/schemas"
import type { JigsawHistoryStore } from "./history-store"
import type { JigsawSessionStore } from "./session-store"

const MIN_PIECE_COUNT = 4
const MAX_PIECE_COUNT = 2_000

export interface CreateJigsawRoomInput {
  imageUrl: string
  assetId?: string
  sourceSize: {
    width: number
    height: number
  }
  pieceCount: number
  assetRef: JigsawSafeAssetRef
}

export interface JigsawSocketData {
  roomId?: string
  sessionToken?: string
  player?: JigsawPlayer
  connectionId?: string
}

export type JigsawSocket = ServerWebSocket<JigsawSocketData>

interface JigsawRoom {
  roomId: string
  assetId: string
  assetRef: JigsawSafeAssetRef
  imageUrl: string
  state: JigsawState
  players: Map<string, JigsawPlayer>
  cursors: Map<string, JigsawPlayerCursor>
  sockets: Set<JigsawSocket>
  locks: Map<GroupId, JigsawGroupLock>
  toggleLocks: Map<string, JigsawLock>
  timer: JigsawRoomTimer
  pingCooldowns: Map<string, number>
  createdAt: number
  updatedAt: number
  completedAt?: number
}

export class JigsawRoomManager {
  private readonly rooms = new Map<string, JigsawRoom>()

  constructor(
    private readonly sessionStore: JigsawSessionStore,
    private readonly historyStore: JigsawHistoryStore
  ) {
    setInterval(
      () => this.cleanupExpiredRooms(),
      LIMITS.jigsaw.cleanupIntervalMs
    )
  }

  createRoom(input: CreateJigsawRoomInput): JigsawRoomSnapshot {
    const room = this.createRoomRecord({
      roomId: createRoomId(),
      assetId: input.assetId ?? "room-image",
      assetRef: input.assetRef,
      imageUrl: input.imageUrl,
      sourceSize: input.sourceSize,
      pieceCount: input.pieceCount,
    })

    return toSnapshot(room)
  }

  getRoomSnapshot(roomId: string): JigsawRoomSnapshot | null {
    const room = this.getRoomForJoin(roomId)

    return room ? toSnapshot(room) : null
  }

  async handleMessage(
    socket: JigsawSocket,
    rawMessage: string | Buffer
  ): Promise<void> {
    const message = parseClientMessage(rawMessage)

    if (!message) {
      send(socket, {
        type: "error",
        code: "bad_message",
        message: "Invalid message",
      })
      return
    }

    if (message.type === "room:join") {
      await this.joinRoom(socket, message.roomId, message.sessionToken)
      return
    }

    const room = socket.data.roomId ? this.rooms.get(socket.data.roomId) : null
    const player = socket.data.player

    if (!room || !player) {
      send(socket, {
        type: "error",
        code: "not_joined",
        message: "Join room first",
      })
      return
    }

    if (message.type === "room:request_state") {
      send(socket, { type: "room:state", state: toSnapshot(room) })
      return
    }

    if (message.type === "session:pause") {
      this.pauseSession(room, player)
      return
    }

    if (message.type === "session:resume") {
      this.resumeSession(room)
      return
    }

    if (message.type === "group:grab") {
      this.grabGroup(socket, room, player, message.groupId)
      return
    }

    if (message.type === "group:move") {
      this.moveGroup(
        socket,
        room,
        player,
        message.groupId,
        message.x,
        message.y
      )
      return
    }

    if (message.type === "group:drop") {
      this.dropGroup(room, player, message.groupId, message.x, message.y)
      return
    }

    if (message.type === "group:release") {
      this.releaseGroup(room, player, message.groupId)
      return
    }

    if (message.type === "groups:arrange") {
      this.arrangeGroups(room, message.mode)
      return
    }

    if (message.type === "room:lock-toggle") {
      this.handleLockToggle(socket, room, player, message)
      return
    }

    if (message.type === "room:ping") {
      this.handlePing(room, player, message)
      return
    }

    if (message.type === "cursor:move") {
      this.moveCursor(socket, room, player, message.x, message.y)
      return
    }

    if (message.type === "cursor:hide") {
      this.hideCursor(socket, room, player.id)
    }
  }

  handleClose(socket: JigsawSocket): void {
    const roomId = socket.data.roomId
    const player = socket.data.player
    const connectionId = socket.data.connectionId

    if (!roomId || !player) {
      return
    }

    const room = this.rooms.get(roomId)

    if (!room) {
      return
    }

    room.sockets.delete(socket)

    this.releaseConnectionLocks(room, connectionId)

    const playerStillConnected = [...room.sockets].some(
      (item) => item.data.player?.id === player.id
    )

    if (!playerStillConnected) {
      room.players.delete(player.id)
      room.cursors.delete(player.id)
      this.releasePlayerLocks(room, player.id)
      room.updatedAt = Date.now()
      void this.historyStore
        .markParticipantLeft(room.roomId, player.id)
        .catch((error) =>
          console.error("Jigsaw participant leave failed", error)
        )
      broadcast(room, { type: "cursor:hidden", playerId: player.id })
      broadcast(room, {
        type: "player:left",
        playerId: player.id,
        playersCount: room.players.size,
      })
      broadcast(room, { type: "stats:updated", stats: getStats(room) })
    }

    // MVP rooms stay in memory until server restart so copied links keep working.
  }

  async updateSessionPlayer(
    sessionToken: string,
    player: JigsawPlayer
  ): Promise<void> {
    const session = await this.sessionStore.getSession(sessionToken)

    for (const room of this.rooms.values()) {
      const currentPlayer = room.players.get(player.id)
      let changed = Boolean(currentPlayer)

      for (const socket of room.sockets) {
        if (socket.data.sessionToken === sessionToken) {
          socket.data.player = player
          changed = true
        }
      }

      if (!changed) {
        continue
      }

      room.players.set(player.id, player)
      updatePlayerLocks(room, player)
      updatePlayerCursor(room, player)
      room.updatedAt = Date.now()
      await this.historyStore.updateParticipantProfile({
        sessionToken,
        player,
        userId: session?.userId,
      })
      broadcast(room, { type: "player:updated", player })
      broadcast(room, { type: "stats:updated", stats: getStats(room) })
    }
  }

  private async joinRoom(
    socket: JigsawSocket,
    roomId: string,
    sessionToken: string
  ): Promise<void> {
    const session = await this.sessionStore.getSession(sessionToken)

    if (!session) {
      send(socket, {
        type: "error",
        code: "session_required",
        message: "Jigsaw session not found",
      })
      return
    }

    const room = this.getRoomForJoin(roomId)

    if (!room) {
      send(socket, {
        type: "error",
        code: "room_not_found",
        message: "Room not found or expired",
      })
      return
    }

    const player = session.player
    const isNewPlayer = !room.players.has(player.id)

    socket.data.connectionId = crypto.randomUUID()
    socket.data.roomId = room.roomId
    socket.data.sessionToken = session.token
    socket.data.player = player
    room.players.set(player.id, player)
    room.sockets.add(socket)
    room.updatedAt = Date.now()

    await this.historyStore.upsertParticipant({
      roomId: room.roomId,
      session,
    })

    send(socket, { type: "room:state", state: toSnapshot(room) })

    if (isNewPlayer) {
      broadcastExcept(room, socket, {
        type: "player:joined",
        player,
        playersCount: room.players.size,
      })
      broadcast(room, { type: "stats:updated", stats: getStats(room) })
    }
  }

  private grabGroup(
    socket: JigsawSocket,
    room: JigsawRoom,
    player: JigsawPlayer,
    groupId: GroupId
  ): void {
    if (room.timer.paused) {
      send(socket, {
        type: "error",
        code: "session_paused",
        message: "Session is paused",
      })
      return
    }

    const group = room.state.groups[groupId]

    if (!group || group.locked) {
      send(socket, {
        type: "error",
        code: "group_unavailable",
        message: "Group unavailable",
      })
      return
    }

    if (this.isGroupBlockedByToggleLock(room, player.id, groupId)) {
      send(socket, {
        type: "error",
        code: "group_locked",
        message: "Group locked",
      })
      return
    }

    const existingLock = room.locks.get(groupId)

    if (existingLock && existingLock.playerId !== player.id) {
      send(socket, {
        type: "error",
        code: "group_locked",
        message: "Group locked",
      })
      return
    }

    const lock = {
      groupId,
      playerId: player.id,
      playerName: player.name,
      lockedAt: Date.now(),
    } satisfies JigsawGroupLock

    room.locks.set(groupId, lock)
    room.updatedAt = Date.now()
    broadcast(room, { type: "group:locked", lock })
  }

  private handleLockToggle(
    socket: JigsawSocket,
    room: JigsawRoom,
    player: JigsawPlayer,
    message: { targetType: "piece" | "group"; targetId: string }
  ): void {
    if (room.timer.paused) {
      send(socket, {
        type: "error",
        code: "session_paused",
        message: "Session is paused",
      })
      return
    }

    if (message.targetType === "piece") {
      const piece = room.state.pieces[message.targetId]

      if (piece?.placed) {
        send(socket, {
          type: "room:lock-rejected",
          targetType: message.targetType,
          targetId: message.targetId,
          reason: "already_placed",
          lockedBy: null,
        })
        return
      }
    }

    if (message.targetType === "group") {
      const group = room.state.groups[message.targetId]

      if (
        group &&
        group.pieceIds.every((id) => room.state.pieces[id]?.placed)
      ) {
        send(socket, {
          type: "room:lock-rejected",
          targetType: message.targetType,
          targetId: message.targetId,
          reason: "already_placed",
          lockedBy: null,
        })
        return
      }
    }

    const key = `${message.targetType}:${message.targetId}`
    const existingLock = room.toggleLocks.get(key)

    if (existingLock) {
      if (existingLock.playerId === player.id) {
        room.toggleLocks.delete(key)
        room.updatedAt = Date.now()
        broadcast(room, {
          type: "room:lock-updated",
          targetType: message.targetType,
          targetId: message.targetId,
          lockedBy: null,
        })
      } else {
        send(socket, {
          type: "room:lock-rejected",
          targetType: message.targetType,
          targetId: message.targetId,
          reason: "already_locked",
          lockedBy: {
            userId: existingLock.playerId,
            name: existingLock.playerName,
            color: existingLock.playerColor,
          },
        })
      }
      return
    }

    const connectionId = socket.data.connectionId

    if (!connectionId) {
      return
    }

    const lock = {
      targetType: message.targetType,
      targetId: message.targetId,
      playerId: player.id,
      playerName: player.name,
      playerColor: player.color,
      lockedAt: Date.now(),
      connectionId,
    } satisfies JigsawLock

    room.toggleLocks.set(key, lock)
    room.updatedAt = Date.now()
    broadcast(room, {
      type: "room:lock-updated",
      targetType: message.targetType,
      targetId: message.targetId,
      lockedBy: {
        userId: player.id,
        name: player.name,
        color: player.color,
      },
    })
  }

  private isGroupBlockedByToggleLock(
    room: JigsawRoom,
    playerId: string,
    groupId: GroupId
  ): boolean {
    const group = room.state.groups[groupId]

    if (!group) {
      return false
    }

    const groupKey = `group:${groupId}`
    const groupLock = room.toggleLocks.get(groupKey)

    if (groupLock && groupLock.playerId !== playerId) {
      return true
    }

    for (const pieceId of group.pieceIds) {
      const pieceKey = `piece:${pieceId}`
      const pieceLock = room.toggleLocks.get(pieceKey)

      if (pieceLock && pieceLock.playerId !== playerId) {
        return true
      }
    }

    return false
  }

  private releaseConnectionLocks(
    room: JigsawRoom,
    connectionId: string | undefined
  ): void {
    if (!connectionId) {
      return
    }

    for (const [key, lock] of room.toggleLocks) {
      if (lock.connectionId === connectionId) {
        room.toggleLocks.delete(key)
        broadcast(room, {
          type: "room:lock-updated",
          targetType: lock.targetType,
          targetId: lock.targetId,
          lockedBy: null,
        })
      }
    }
  }

  private moveGroup(
    socket: JigsawSocket,
    room: JigsawRoom,
    player: JigsawPlayer,
    groupId: GroupId,
    x: number,
    y: number
  ): void {
    if (room.timer.paused) {
      send(socket, {
        type: "error",
        code: "session_paused",
        message: "Session is paused",
      })
      return
    }

    if (!this.playerOwnsLock(room, player.id, groupId)) {
      send(socket, {
        type: "error",
        code: "lock_required",
        message: "Lock required",
      })
      return
    }

    if (this.isGroupBlockedByToggleLock(room, player.id, groupId)) {
      send(socket, {
        type: "error",
        code: "group_locked",
        message: "Group locked",
      })
      return
    }

    const affectedPieceIds = moveGroupToAnchor(room.state, groupId, x, y)

    if (affectedPieceIds.length === 0) {
      return
    }

    room.updatedAt = Date.now()
    broadcastExcept(room, socket, {
      type: "group:moved",
      groupId,
      playerId: player.id,
      x,
      y,
      affectedPieceIds,
    })
  }

  private dropGroup(
    room: JigsawRoom,
    player: JigsawPlayer,
    groupId: GroupId,
    x: number,
    y: number
  ): void {
    if (room.timer.paused) {
      this.releaseGroup(room, player, groupId)
      return
    }

    if (!this.playerOwnsLock(room, player.id, groupId)) {
      return
    }

    if (this.isGroupBlockedByToggleLock(room, player.id, groupId)) {
      this.releaseGroup(room, player, groupId)
      return
    }

    const beforeGroupIds = new Set(Object.keys(room.state.groups))
    moveGroupToAnchor(room.state, groupId, x, y)

    const snap = snapDroppedGroup(room.state, groupId)
    const removedGroupIds = [...beforeGroupIds].filter(
      (id) => !room.state.groups[id]
    )
    const affectedPieceIds = snap.affectedPieceIds
    const groups = pickGroupsForPieces(room.state, affectedPieceIds)
    const pieces = pickPieces(room.state, affectedPieceIds)
    const finalAnchor = getGroupAnchorPosition(room.state, snap.groupId) ?? {
      x,
      y,
    }

    room.updatedAt = Date.now()

    for (const removedGroupId of removedGroupIds) {
      const removedKey = `group:${removedGroupId}`
      const removedLock = room.toggleLocks.get(removedKey)
      if (removedLock) {
        room.toggleLocks.delete(removedKey)
        const keptKey = `group:${snap.groupId}`
        if (!room.toggleLocks.has(keptKey)) {
          room.toggleLocks.set(keptKey, {
            ...removedLock,
            targetId: snap.groupId,
          })
        }
        broadcast(room, {
          type: "room:lock-updated",
          targetType: "group",
          targetId: removedGroupId,
          lockedBy: null,
        })
        broadcast(room, {
          type: "room:lock-updated",
          targetType: "group",
          targetId: snap.groupId,
          lockedBy: {
            userId: removedLock.playerId,
            name: removedLock.playerName,
            color: removedLock.playerColor,
          },
        })
      }
    }

    if (snap.kind === "neighbor") {
      broadcast(room, {
        type: "groups:merged",
        groupId: snap.groupId,
        removedGroupIds,
        groups,
        pieces,
        snapCount: room.state.snapCount,
      })
    } else if (snap.kind === "correct") {
      broadcast(room, {
        type: "pieces:placed",
        groupId: snap.groupId,
        groups,
        pieces,
        snapCount: room.state.snapCount,
      })
    } else {
      broadcast(room, {
        type: "group:moved",
        groupId: snap.groupId,
        playerId: player.id,
        x: finalAnchor.x,
        y: finalAnchor.y,
        affectedPieceIds,
        final: true,
      })
    }

    this.releaseGroup(room, player, groupId)
    broadcast(room, { type: "stats:updated", stats: getStats(room) })
    this.recordCompletionIfSolved(room)
  }

  private arrangeGroups(room: JigsawRoom, mode: ArrangeLoosePiecesMode): void {
    if (room.timer.paused) {
      return
    }

    const affectedPieceIds = arrangeLoosePieces(room.state, mode)

    if (affectedPieceIds.length === 0) {
      return
    }

    room.updatedAt = Date.now()
    broadcast(room, {
      type: "groups:arranged",
      pieces: pickPieces(room.state, affectedPieceIds),
    })
    broadcast(room, { type: "stats:updated", stats: getStats(room) })
  }

  private releaseGroup(
    room: JigsawRoom,
    player: JigsawPlayer,
    groupId: GroupId
  ): void {
    const lock = room.locks.get(groupId)

    if (!lock || lock.playerId !== player.id) {
      return
    }

    room.locks.delete(groupId)
    room.updatedAt = Date.now()
    broadcast(room, { type: "group:unlocked", groupId, playerId: player.id })
  }

  private moveCursor(
    socket: JigsawSocket,
    room: JigsawRoom,
    player: JigsawPlayer,
    x: number,
    y: number
  ): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return
    }

    const cursor = {
      playerId: player.id,
      playerName: player.name,
      color: player.color,
      x,
      y,
      updatedAt: Date.now(),
    } satisfies JigsawPlayerCursor

    room.cursors.set(player.id, cursor)
    broadcastExcept(room, socket, { type: "cursor:moved", cursor })
  }

  private hideCursor(
    socket: JigsawSocket,
    room: JigsawRoom,
    playerId: string
  ): void {
    if (!room.cursors.delete(playerId)) {
      return
    }

    broadcastExcept(room, socket, { type: "cursor:hidden", playerId })
  }

  private handlePing(
    room: JigsawRoom,
    player: JigsawPlayer,
    message: { id: string; x: number; y: number }
  ): void {
    if (!Number.isFinite(message.x) || !Number.isFinite(message.y)) {
      return
    }

    const now = Date.now()
    const lastPing = room.pingCooldowns.get(player.id)

    if (lastPing && now - lastPing < LIMITS.jigsaw.pingCooldownMs) {
      return
    }

    room.pingCooldowns.set(player.id, now)
    broadcast(room, {
      type: "room:pinged",
      id: message.id,
      userId: player.id,
      userName: player.name,
      userColor: player.color,
      x: message.x,
      y: message.y,
      createdAt: now,
    })
  }

  private pauseSession(room: JigsawRoom, player: JigsawPlayer): void {
    if (room.timer.paused) {
      return
    }

    const now = Date.now()
    room.timer = {
      elapsedMs: getTimerElapsedMs(room.timer, now),
      paused: true,
      updatedAt: now,
      pausedByPlayerId: player.id,
      pausedByPlayerName: player.name,
    }
    room.updatedAt = now

    this.releaseAllLocks(room)
    broadcast(room, { type: "session:paused", timer: room.timer })
  }

  private resumeSession(room: JigsawRoom): void {
    if (!room.timer.paused) {
      return
    }

    const now = Date.now()
    room.timer = {
      elapsedMs: room.timer.elapsedMs,
      paused: false,
      updatedAt: now,
    }
    room.updatedAt = now
    broadcast(room, { type: "session:resumed", timer: room.timer })
  }

  private releaseAllLocks(room: JigsawRoom): void {
    for (const [groupId, lock] of room.locks) {
      room.locks.delete(groupId)
      broadcast(room, {
        type: "group:unlocked",
        groupId,
        playerId: lock.playerId,
      })
    }

    for (const [key, lock] of room.toggleLocks) {
      room.toggleLocks.delete(key)
      broadcast(room, {
        type: "room:lock-updated",
        targetType: lock.targetType,
        targetId: lock.targetId,
        lockedBy: null,
      })
    }
  }

  private releasePlayerLocks(room: JigsawRoom, playerId: string): void {
    for (const [groupId, lock] of room.locks) {
      if (lock.playerId === playerId) {
        room.locks.delete(groupId)
        broadcast(room, { type: "group:unlocked", groupId, playerId })
      }
    }

    for (const [key, lock] of room.toggleLocks) {
      if (lock.playerId === playerId) {
        room.toggleLocks.delete(key)
        broadcast(room, {
          type: "room:lock-updated",
          targetType: lock.targetType,
          targetId: lock.targetId,
          lockedBy: null,
        })
      }
    }
  }

  private playerOwnsLock(
    room: JigsawRoom,
    playerId: string,
    groupId: GroupId
  ): boolean {
    return room.locks.get(groupId)?.playerId === playerId
  }

  private recordCompletionIfSolved(room: JigsawRoom): void {
    if (room.completedAt) {
      return
    }

    const stats = getStats(room)

    if (stats.placedPieces < stats.totalPieces) {
      return
    }

    const completedAt = Date.now()
    room.completedAt = completedAt

    if (!room.timer.paused) {
      room.timer.elapsedMs = getTimerElapsedMs(room.timer, completedAt)
      room.timer.updatedAt = completedAt
      room.timer.paused = true
    }

    void this.historyStore
      .recordCompletion({
        roomId: room.roomId,
        assetRef: room.assetRef,
        jigsawConfig: room.state.config,
        imageUrl: room.imageUrl,
        elapsedMs: getTimerElapsedMs(room.timer, completedAt),
        pieceCount: stats.totalPieces,
        snapCount: stats.snapCount,
        completedAt: new Date(completedAt),
      })
      .catch((error) =>
        console.error("Jigsaw completion history failed", error)
      )
  }

  private getRoomForJoin(roomId: string): JigsawRoom | null {
    return this.rooms.get(roomId) ?? null
  }

  private cleanupExpiredRooms(): void {
    const now = Date.now()

    for (const [roomId, room] of this.rooms) {
      if (
        room.sockets.size === 0 &&
        now - room.updatedAt > LIMITS.jigsaw.roomTtlMs
      ) {
        this.rooms.delete(roomId)
      }
    }
  }

  private createRoomRecord({
    roomId,
    assetId,
    assetRef,
    imageUrl,
    sourceSize,
    pieceCount,
  }: {
    roomId: string
    assetId: string
    assetRef: JigsawSafeAssetRef
    imageUrl: string
    sourceSize: { width: number; height: number }
    pieceCount: number
  }): JigsawRoom {
    const safePieceCount = clampPieceCount(pieceCount)
    const baseConfig = {
      ...JIGSAW_CONFIG_2000,
      rows: 1,
      cols: safePieceCount,
    }

    const state = createJigsawState(
      createImageJigsawConfig(baseConfig, sourceSize)
    )
    scatterAllPieces(state)

    const now = Date.now()
    const room = {
      roomId,
      assetId,
      assetRef,
      imageUrl,
      state,
      players: new Map<string, JigsawPlayer>(),
      cursors: new Map<string, JigsawPlayerCursor>(),
      sockets: new Set<JigsawSocket>(),
      locks: new Map<GroupId, JigsawGroupLock>(),
      toggleLocks: new Map<string, JigsawLock>(),
      pingCooldowns: new Map<string, number>(),
      timer: {
        elapsedMs: 0,
        paused: false,
        updatedAt: now,
      },
      createdAt: now,
      updatedAt: now,
    } satisfies JigsawRoom

    this.rooms.set(roomId, room)

    return room
  }
}

function createRoomId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12)
}

function clampPieceCount(value: number): number {
  if (!Number.isFinite(value)) {
    return JIGSAW_CONFIG_2000.rows * JIGSAW_CONFIG_2000.cols
  }

  return Math.max(MIN_PIECE_COUNT, Math.min(MAX_PIECE_COUNT, Math.round(value)))
}

function toSnapshot(room: JigsawRoom): JigsawRoomSnapshot {
  const toggleLocks: JigsawLock[] = [...room.toggleLocks.values()]

  return {
    roomId: room.roomId,
    jigsaw: {
      assetId: room.assetId,
      imageUrl: room.imageUrl,
      config: room.state.config,
    },
    pieces: room.state.pieces,
    groups: room.state.groups,
    players: [...room.players.values()],
    locks: toggleLocks,
    cursors: [...room.cursors.values()],
    timer: room.timer,
    stats: getStats(room),
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
  }
}

function getStats(room: JigsawRoom): JigsawRoomStats {
  return {
    totalPieces: Object.keys(room.state.pieces).length,
    placedPieces: Object.values(room.state.pieces).filter(
      (piece) => piece.placed
    ).length,
    groupsCount: Object.keys(room.state.groups).length,
    playersCount: room.players.size,
    snapCount: room.state.snapCount,
  }
}

function updatePlayerLocks(room: JigsawRoom, player: JigsawPlayer): void {
  for (const [groupId, lock] of room.locks) {
    if (lock.playerId === player.id) {
      room.locks.set(groupId, { ...lock, playerName: player.name })
    }
  }

  for (const [key, lock] of room.toggleLocks) {
    if (lock.playerId === player.id) {
      room.toggleLocks.set(key, {
        ...lock,
        playerName: player.name,
        playerColor: player.color,
      })
    }
  }
}

function updatePlayerCursor(room: JigsawRoom, player: JigsawPlayer): void {
  const cursor = room.cursors.get(player.id)

  if (!cursor) {
    return
  }

  const nextCursor = {
    ...cursor,
    playerName: player.name,
    color: player.color,
    updatedAt: Date.now(),
  } satisfies JigsawPlayerCursor

  room.cursors.set(player.id, nextCursor)
  broadcast(room, { type: "cursor:moved", cursor: nextCursor })
}

function getTimerElapsedMs(timer: JigsawRoomTimer, now = Date.now()): number {
  if (timer.paused) {
    return timer.elapsedMs
  }

  return timer.elapsedMs + Math.max(0, now - timer.updatedAt)
}

function pickPieces(
  state: JigsawState,
  pieceIds: PieceId[]
): Record<PieceId, PieceState> {
  const pieces: Record<PieceId, PieceState> = {}

  for (const pieceId of pieceIds) {
    const piece = state.pieces[pieceId]

    if (piece) {
      pieces[pieceId] = piece
    }
  }

  return pieces
}

function pickGroupsForPieces(
  state: JigsawState,
  pieceIds: PieceId[]
): Record<GroupId, GroupState> {
  const groups: Record<GroupId, GroupState> = {}

  for (const pieceId of pieceIds) {
    const groupId = state.pieces[pieceId]?.groupId

    if (!groupId) {
      continue
    }

    const group = state.groups[groupId]

    if (group) {
      groups[groupId] = group
    }
  }

  return groups
}

function getGroupAnchorPosition(
  state: JigsawState,
  groupId: GroupId
): { x: number; y: number } | null {
  const group = state.groups[groupId]
  const pieceId = group?.pieceIds[0]
  const piece = pieceId ? state.pieces[pieceId] : null

  return piece ? { x: piece.x, y: piece.y } : null
}

function send(socket: JigsawSocket, message: ServerToClientMessage): void {
  socket.send(JSON.stringify(message))
}

function broadcast(room: JigsawRoom, message: ServerToClientMessage): void {
  const payload = JSON.stringify(message)

  for (const socket of room.sockets) {
    socket.send(payload)
  }
}

function broadcastExcept(
  room: JigsawRoom,
  except: JigsawSocket,
  message: ServerToClientMessage
): void {
  const payload = JSON.stringify(message)

  for (const socket of room.sockets) {
    if (socket !== except) {
      socket.send(payload)
    }
  }
}

function parseClientMessage(
  rawMessage: string | Buffer
): ClientToServerMessage | null {
  const text =
    typeof rawMessage === "string" ? rawMessage : rawMessage.toString()

  try {
    return JSON.parse(text) as ClientToServerMessage
  } catch {
    return null
  }
}
