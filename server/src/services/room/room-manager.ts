import { moveGroupToAnchor } from "@jigtable/core/groups"
import type { JigsawPlayer } from "@jigtable/core/protocol"
import type { ArrangeLoosePiecesMode } from "@jigtable/core/scatter"
import { arrangeLoosePieces } from "@jigtable/core/scatter"
import { snapDroppedGroup } from "@jigtable/core/snap"
import type { GroupId } from "@jigtable/core/types"

import {
  broadcast,
  broadcastExcept,
  sendRoomMessage,
  sendWsError,
} from "@/api/ws/send"
import { LIMITS } from "@/config"
import { wsRoomsCurrent, wsUsersCurrent } from "@/observability/metrics"
import type { JigsawHistoryStore } from "../../../services/jigsaw-history/history-storery/history-store"
import type { JigsawSessionStore } from "../../../services/jigsaw-session/session-storeon/session-store"
import { markRoomCompletedIfSolved } from "./room-completion"
import { createJigsawRoomRecord } from "./room-factory"
import {
  isGroupBlockedByToggleLock,
  playerOwnsLock,
  releaseAllLocks,
  releaseConnectionLocks,
  releasePlayerLocks,
  updatePlayerLocks,
} from "./room-locks"
import { updatePlayerCursor } from "./room-participants"
import {
  getGroupAnchorPosition,
  pickGroupsForPieces,
  pickPieces,
  toSnapshot,
} from "./room-snapshot"
import { getRoomStats } from "./room-stats"
import { getTimerElapsedMs } from "./room-timer"
import type {
  CreateJigsawRoomInput,
  JigsawGroupLock,
  JigsawLock,
  JigsawRoom,
  JigsawRoomSnapshot,
  JigsawSocket,
} from "./room-types"

export class RoomService {
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
    const room = createJigsawRoomRecord({
      assetId: input.assetId ?? "room-image",
      assetRef: input.assetRef,
      imageUrl: input.imageUrl,
      sourceSize: input.sourceSize,
      pieceCount: input.pieceCount,
    })

    this.rooms.set(room.roomId, room)
    this.syncGauges()

    return toSnapshot(room)
  }

  getRoomSnapshot(roomId: string): JigsawRoomSnapshot | null {
    const room = this.getRoomForJoin(roomId)

    return room ? toSnapshot(room) : null
  }

  async handleRoomJoin(
    socket: JigsawSocket,
    input: { roomId: string; sessionToken: string }
  ): Promise<void> {
    await this.joinRoom(socket, input.roomId, input.sessionToken)
  }

  handleRoomRequestState(socket: JigsawSocket): void {
    const joined = this.getJoinedRoom(socket)

    if (!joined) {
      return
    }

    sendRoomMessage(socket, {
      type: "room:state",
      state: toSnapshot(joined.room),
    })
  }

  handleSessionPause(socket: JigsawSocket): void {
    const joined = this.getJoinedRoom(socket)

    if (!joined) {
      return
    }

    this.pauseSession(joined.room, joined.player)
  }

  handleSessionResume(socket: JigsawSocket): void {
    const joined = this.getJoinedRoom(socket)

    if (!joined) {
      return
    }

    this.resumeSession(joined.room)
  }

  handleGroupGrab(socket: JigsawSocket, input: { groupId: string }): void {
    const joined = this.getJoinedRoom(socket)

    if (!joined) {
      return
    }

    this.grabGroup(socket, joined.room, joined.player, input.groupId as GroupId)
  }

  handleGroupMove(
    socket: JigsawSocket,
    input: { groupId: string; x: number; y: number }
  ): void {
    const joined = this.getJoinedRoom(socket)

    if (!joined) {
      return
    }

    this.moveGroup(
      socket,
      joined.room,
      joined.player,
      input.groupId as GroupId,
      input.x,
      input.y
    )
  }

  handleGroupDrop(
    socket: JigsawSocket,
    input: { groupId: string; x: number; y: number }
  ): void {
    const joined = this.getJoinedRoom(socket)

    if (!joined) {
      return
    }

    this.dropGroup(
      joined.room,
      joined.player,
      input.groupId as GroupId,
      input.x,
      input.y
    )
  }

  handleGroupRelease(socket: JigsawSocket, input: { groupId: string }): void {
    const joined = this.getJoinedRoom(socket)

    if (!joined) {
      return
    }

    this.releaseGroup(joined.room, joined.player, input.groupId as GroupId)
  }

  handleGroupsArrange(
    socket: JigsawSocket,
    input: { mode: ArrangeLoosePiecesMode }
  ): void {
    const joined = this.getJoinedRoom(socket)

    if (!joined) {
      return
    }

    this.arrangeGroups(joined.room, input.mode)
  }

  handleRoomLockToggle(
    socket: JigsawSocket,
    input: { targetType: "piece" | "group"; targetId: string }
  ): void {
    const joined = this.getJoinedRoom(socket)

    if (!joined) {
      return
    }

    this.handleLockToggle(socket, joined.room, joined.player, input)
  }

  handleRoomPing(
    socket: JigsawSocket,
    input: { id: string; x: number; y: number }
  ): void {
    const joined = this.getJoinedRoom(socket)

    if (!joined) {
      return
    }

    this.handlePing(joined.room, joined.player, input)
  }

  handleCursorMove(
    socket: JigsawSocket,
    input: { x: number; y: number }
  ): void {
    const joined = this.getJoinedRoom(socket)

    if (!joined) {
      return
    }

    this.moveCursor(socket, joined.room, joined.player, input.x, input.y)
  }

  handleCursorHide(socket: JigsawSocket): void {
    const joined = this.getJoinedRoom(socket)

    if (!joined) {
      return
    }

    this.hideCursor(socket, joined.room, joined.player.id)
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
    releaseConnectionLocks(room, connectionId)

    const playerStillConnected = [...room.sockets].some(
      (item) => item.data.player?.id === player.id
    )

    if (!playerStillConnected) {
      room.players.delete(player.id)
      room.cursors.delete(player.id)
      releasePlayerLocks(room, player.id)
      room.updatedAt = Date.now()

      void this.historyStore
        .markParticipantLeft(room.roomId, player.id)
        .catch((error) =>
          console.error("Jigsaw participant leave failed", error)
        )

      broadcast(room, {
        type: "cursor:hidden",
        playerId: player.id,
      })
      broadcast(room, {
        type: "player:left",
        playerId: player.id,
        playersCount: room.players.size,
      })
      broadcast(room, {
        type: "stats:updated",
        stats: getRoomStats(room),
      })
    }

    this.syncGauges()
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

      broadcast(room, {
        type: "player:updated",
        player,
      })
      broadcast(room, {
        type: "stats:updated",
        stats: getRoomStats(room),
      })
    }
  }

  private getJoinedRoom(
    socket: JigsawSocket
  ): { room: JigsawRoom; player: JigsawPlayer } | null {
    const room = socket.data.roomId ? this.rooms.get(socket.data.roomId) : null
    const player = socket.data.player

    if (!room || !player) {
      sendWsError(socket, "not_joined", "Join room first")
      return null
    }

    return { room, player }
  }

  private syncGauges(): void {
    let users = 0

    for (const room of this.rooms.values()) {
      users += room.players.size
    }

    wsRoomsCurrent.set(this.rooms.size)
    wsUsersCurrent.set(users)
  }

  private async joinRoom(
    socket: JigsawSocket,
    roomId: string,
    sessionToken: string
  ): Promise<void> {
    const session = await this.sessionStore.getSession(sessionToken)

    if (!session) {
      sendWsError(socket, "session_required", "Jigsaw session not found")
      return
    }

    const room = this.getRoomForJoin(roomId)

    if (!room) {
      sendWsError(socket, "room_not_found", "Room not found or expired")
      return
    }

    const player = session.player
    const isNewPlayer = !room.players.has(player.id)

    socket.data.roomId = room.roomId
    socket.data.sessionToken = session.token
    socket.data.player = player

    room.players.set(player.id, player)
    room.sockets.add(socket)
    room.updatedAt = Date.now()

    this.syncGauges()

    await this.historyStore.upsertParticipant({
      roomId: room.roomId,
      session,
    })

    sendRoomMessage(socket, {
      type: "room:state",
      state: toSnapshot(room),
    })

    if (isNewPlayer) {
      broadcastExcept(room, socket, {
        type: "player:joined",
        player,
        playersCount: room.players.size,
      })
      broadcast(room, {
        type: "stats:updated",
        stats: getRoomStats(room),
      })
    }
  }

  private grabGroup(
    socket: JigsawSocket,
    room: JigsawRoom,
    player: JigsawPlayer,
    groupId: GroupId
  ): void {
    if (room.timer.paused) {
      sendWsError(socket, "session_paused", "Session is paused")
      return
    }

    const group = room.state.groups[groupId]

    if (!group || group.locked) {
      sendWsError(socket, "group_unavailable", "Group unavailable")
      return
    }

    if (isGroupBlockedByToggleLock(room, player.id, groupId)) {
      sendWsError(socket, "group_locked", "Group locked")
      return
    }

    const existingLock = room.locks.get(groupId)

    if (existingLock && existingLock.playerId !== player.id) {
      sendWsError(socket, "group_locked", "Group locked")
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

    broadcast(room, {
      type: "group:locked",
      lock,
    })
  }

  private handleLockToggle(
    socket: JigsawSocket,
    room: JigsawRoom,
    player: JigsawPlayer,
    message: { targetType: "piece" | "group"; targetId: string }
  ): void {
    if (room.timer.paused) {
      sendWsError(socket, "session_paused", "Session is paused")
      return
    }

    if (message.targetType === "piece") {
      const piece = room.state.pieces[message.targetId]

      if (piece?.placed) {
        sendRoomMessage(socket, {
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
        sendRoomMessage(socket, {
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
        sendRoomMessage(socket, {
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

  private moveGroup(
    socket: JigsawSocket,
    room: JigsawRoom,
    player: JigsawPlayer,
    groupId: GroupId,
    x: number,
    y: number
  ): void {
    if (room.timer.paused) {
      sendWsError(socket, "session_paused", "Session is paused")
      return
    }

    if (!playerOwnsLock(room, player.id, groupId)) {
      sendWsError(socket, "lock_required", "Lock required")
      return
    }

    if (isGroupBlockedByToggleLock(room, player.id, groupId)) {
      sendWsError(socket, "group_locked", "Group locked")
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

    if (!playerOwnsLock(room, player.id, groupId)) {
      return
    }

    if (isGroupBlockedByToggleLock(room, player.id, groupId)) {
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

      if (!removedLock) {
        continue
      }

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

    broadcast(room, {
      type: "stats:updated",
      stats: getRoomStats(room),
    })

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
    broadcast(room, {
      type: "stats:updated",
      stats: getRoomStats(room),
    })
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

    broadcast(room, {
      type: "group:unlocked",
      groupId,
      playerId: player.id,
    })
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
    }

    room.cursors.set(player.id, cursor)

    broadcastExcept(room, socket, {
      type: "cursor:moved",
      cursor,
    })
  }

  private hideCursor(
    socket: JigsawSocket,
    room: JigsawRoom,
    playerId: string
  ): void {
    if (!room.cursors.delete(playerId)) {
      return
    }

    broadcastExcept(room, socket, {
      type: "cursor:hidden",
      playerId,
    })
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

    releaseAllLocks(room)

    broadcast(room, {
      type: "session:paused",
      timer: room.timer,
    })
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

    broadcast(room, {
      type: "session:resumed",
      timer: room.timer,
    })
  }

  private recordCompletionIfSolved(room: JigsawRoom): void {
    const completed = markRoomCompletedIfSolved(room)

    if (!completed) {
      return
    }

    void this.historyStore
      .recordCompletion({
        roomId: room.roomId,
        assetRef: room.assetRef,
        jigsawConfig: room.state.config,
        imageUrl: room.imageUrl,
        elapsedMs: completed.elapsedMs,
        pieceCount: completed.pieceCount,
        snapCount: completed.snapCount,
        completedAt: new Date(completed.completedAt),
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
    let changed = false

    for (const [roomId, room] of this.rooms) {
      if (
        room.sockets.size === 0 &&
        now - room.updatedAt > LIMITS.jigsaw.roomTtlMs
      ) {
        this.rooms.delete(roomId)
        changed = true
      }
    }

    if (changed) {
      this.syncGauges()
    }
  }
}
