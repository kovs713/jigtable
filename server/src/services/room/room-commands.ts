import { moveGroupToAnchor } from "@jigtable/core/groups"
import type { ArrangeLoosePiecesMode } from "@jigtable/core/scatter"
import { arrangeLoosePieces } from "@jigtable/core/scatter"
import { snapDroppedGroup } from "@jigtable/core/snap"
import type { GroupId } from "@jigtable/core/types"

import { LIMITS } from "@/config"

import {
  completeRoomIfSolved,
  type CompletedRoomRecord,
} from "./room-completion"
import type { LockTargetType, RoomPublisher } from "./room-events"
import {
  isGroupToggleLocked,
  lockKey,
  playerOwnsDragLock,
  releaseAllLocks,
  transferMergedGroupLocks,
} from "./room-locks"
import {
  getGroupAnchorPosition,
  pickGroupsForPieces,
  pickPieces,
} from "./room-snapshot"
import { getRoomStats } from "./room-stats"
import { pauseRoom, resumeRoom } from "./room-timer"
import type {
  GroupDragLock,
  Player,
  PlayerCursor,
  Room,
  ToggleLock,
} from "./room-types"

type RoomCommandsOptions = {
  publisher: RoomPublisher
  now?: () => number
}

export class RoomCommands {
  private readonly now: () => number

  constructor(
    private readonly publisher: RoomPublisher,
    options: Omit<RoomCommandsOptions, "publisher"> = {}
  ) {
    this.now = options.now ?? Date.now
  }

  grabGroup(
    connectionId: string,
    room: Room,
    player: Player,
    groupId: GroupId
  ): void {
    if (this.rejectPaused(connectionId, room)) {
      return
    }

    const group = room.state.groups[groupId]

    if (!group || group.locked) {
      this.publisher.error(
        connectionId,
        "group_unavailable",
        "Group unavailable"
      )
      return
    }

    if (isGroupToggleLocked(room, player.id, groupId)) {
      this.publisher.error(connectionId, "group_locked", "Group locked")
      return
    }

    const existingLock = room.dragLocks.get(groupId)

    if (existingLock && existingLock.playerId !== player.id) {
      this.publisher.error(connectionId, "group_locked", "Group locked")
      return
    }

    const lock = {
      groupId,
      playerId: player.id,
      playerName: player.name,
      lockedAt: this.now(),
    } satisfies GroupDragLock

    room.dragLocks.set(groupId, lock)
    room.updatedAt = this.now()

    this.publisher.broadcast(room.roomId, {
      type: "group:locked",
      lock,
    })
  }

  moveGroup(
    connectionId: string,
    room: Room,
    player: Player,
    input: {
      groupId: GroupId
      x: number
      y: number
    }
  ): void {
    if (this.rejectPaused(connectionId, room)) {
      return
    }

    if (!playerOwnsDragLock(room, player.id, input.groupId)) {
      this.publisher.error(connectionId, "lock_required", "Lock required")
      return
    }

    if (isGroupToggleLocked(room, player.id, input.groupId)) {
      this.publisher.error(connectionId, "group_locked", "Group locked")
      return
    }

    const affectedPieceIds = moveGroupToAnchor(
      room.state,
      input.groupId,
      input.x,
      input.y
    )

    if (affectedPieceIds.length === 0) {
      return
    }

    room.updatedAt = this.now()

    this.publisher.broadcastExcept(room.roomId, connectionId, {
      type: "group:moved",
      groupId: input.groupId,
      playerId: player.id,
      x: input.x,
      y: input.y,
      affectedPieceIds,
    })
  }

  dropGroup(
    room: Room,
    player: Player,
    input: {
      groupId: GroupId
      x: number
      y: number
    }
  ): CompletedRoomRecord | null {
    if (room.timer.paused) {
      this.releaseGroup(room, player, input.groupId)
      return null
    }

    if (!playerOwnsDragLock(room, player.id, input.groupId)) {
      return null
    }

    if (isGroupToggleLocked(room, player.id, input.groupId)) {
      this.releaseGroup(room, player, input.groupId)
      return null
    }

    const beforeGroupIds = new Set(Object.keys(room.state.groups))

    moveGroupToAnchor(room.state, input.groupId, input.x, input.y)

    const snap = snapDroppedGroup(room.state, input.groupId)
    const removedGroupIds = [...beforeGroupIds].filter(
      (id) => !room.state.groups[id]
    )
    const affectedPieceIds = snap.affectedPieceIds
    const groups = pickGroupsForPieces(room.state, affectedPieceIds)
    const pieces = pickPieces(room.state, affectedPieceIds)
    const finalAnchor = getGroupAnchorPosition(room.state, snap.groupId) ?? {
      x: input.x,
      y: input.y,
    }

    room.updatedAt = this.now()

    transferMergedGroupLocks({
      room,
      removedGroupIds,
      keptGroupId: snap.groupId,
      publisher: this.publisher,
    })

    if (snap.kind === "neighbor") {
      this.publisher.broadcast(room.roomId, {
        type: "groups:merged",
        groupId: snap.groupId,
        removedGroupIds,
        groups,
        pieces,
        snapCount: room.state.snapCount,
      })
    } else if (snap.kind === "correct") {
      this.publisher.broadcast(room.roomId, {
        type: "pieces:placed",
        groupId: snap.groupId,
        groups,
        pieces,
        snapCount: room.state.snapCount,
      })
    } else {
      this.publisher.broadcast(room.roomId, {
        type: "group:moved",
        groupId: snap.groupId,
        playerId: player.id,
        x: finalAnchor.x,
        y: finalAnchor.y,
        affectedPieceIds,
        final: true,
      })
    }

    this.releaseGroup(room, player, input.groupId)

    this.publishStats(room)

    return completeRoomIfSolved(room, this.now())
  }

  releaseGroup(room: Room, player: Player, groupId: GroupId): void {
    const lock = room.dragLocks.get(groupId)

    if (!lock || lock.playerId !== player.id) {
      return
    }

    room.dragLocks.delete(groupId)
    room.updatedAt = this.now()

    this.publisher.broadcast(room.roomId, {
      type: "group:unlocked",
      groupId,
      playerId: player.id,
    })
  }

  arrangeGroups(room: Room, mode: ArrangeLoosePiecesMode): void {
    if (room.timer.paused) {
      return
    }

    const affectedPieceIds = arrangeLoosePieces(room.state, mode)

    if (affectedPieceIds.length === 0) {
      return
    }

    room.updatedAt = this.now()

    this.publisher.broadcast(room.roomId, {
      type: "groups:arranged",
      pieces: pickPieces(room.state, affectedPieceIds),
    })

    this.publishStats(room)
  }

  toggleLock(
    connectionId: string,
    room: Room,
    player: Player,
    input: {
      targetType: LockTargetType
      targetId: string
    }
  ): void {
    if (this.rejectPaused(connectionId, room)) {
      return
    }

    if (this.isAlreadyPlaced(room, input)) {
      this.publisher.send(connectionId, {
        type: "room:lock-rejected",
        ...input,
        reason: "already_placed",
        lockedBy: null,
      })
      return
    }

    const key = lockKey(input.targetType, input.targetId)
    const existingLock = room.toggleLocks.get(key)

    if (existingLock) {
      if (existingLock.playerId === player.id) {
        room.toggleLocks.delete(key)
        room.updatedAt = this.now()

        this.publisher.broadcast(room.roomId, {
          type: "room:lock-updated",
          ...input,
          lockedBy: null,
        })
      } else {
        this.publisher.send(connectionId, {
          type: "room:lock-rejected",
          ...input,
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

    const lock = {
      ...input,
      playerId: player.id,
      playerName: player.name,
      playerColor: player.color,
      lockedAt: this.now(),
      connectionId,
    } satisfies ToggleLock

    room.toggleLocks.set(key, lock)
    room.updatedAt = this.now()

    this.publisher.broadcast(room.roomId, {
      type: "room:lock-updated",
      ...input,
      lockedBy: {
        userId: player.id,
        name: player.name,
        color: player.color,
      },
    })
  }

  moveCursor(
    connectionId: string,
    room: Room,
    player: Player,
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
      updatedAt: this.now(),
    } satisfies PlayerCursor

    room.cursors.set(player.id, cursor)

    this.publisher.broadcastExcept(room.roomId, connectionId, {
      type: "cursor:moved",
      cursor,
    })
  }

  hideCursor(connectionId: string, room: Room, playerId: string): void {
    if (!room.cursors.delete(playerId)) {
      return
    }

    this.publisher.broadcastExcept(room.roomId, connectionId, {
      type: "cursor:hidden",
      playerId,
    })
  }

  ping(
    room: Room,
    player: Player,
    input: {
      id: string
      x: number
      y: number
    }
  ): void {
    if (!Number.isFinite(input.x) || !Number.isFinite(input.y)) {
      return
    }

    const now = this.now()
    const lastPing = room.pingCooldowns.get(player.id)

    if (
      lastPing !== undefined &&
      now - lastPing < LIMITS.jigsaw.pingCooldownMs
    ) {
      return
    }

    room.pingCooldowns.set(player.id, now)

    this.publisher.broadcast(room.roomId, {
      type: "room:pinged",
      id: input.id,
      userId: player.id,
      userName: player.name,
      userColor: player.color,
      x: input.x,
      y: input.y,
      createdAt: now,
    })
  }

  pause(room: Room, player: Player): void {
    const timer = pauseRoom(room, player, this.now())

    if (!timer) {
      return
    }

    releaseAllLocks(room, this.publisher)

    this.publisher.broadcast(room.roomId, {
      type: "session:paused",
      timer,
    })
  }

  resume(room: Room): void {
    const timer = resumeRoom(room, this.now())

    if (!timer) {
      return
    }

    this.publisher.broadcast(room.roomId, {
      type: "session:resumed",
      timer,
    })
  }

  publishStats(room: Room): void {
    this.publisher.broadcast(room.roomId, {
      type: "stats:updated",
      stats: getRoomStats(room),
    })
  }

  private rejectPaused(connectionId: string, room: Room): boolean {
    if (!room.timer.paused) {
      return false
    }

    this.publisher.error(connectionId, "session_paused", "Session is paused")

    return true
  }

  private isAlreadyPlaced(
    room: Room,
    input: {
      targetType: LockTargetType
      targetId: string
    }
  ): boolean {
    if (input.targetType === "piece") {
      return Boolean(room.state.pieces[input.targetId]?.placed)
    }

    const group = room.state.groups[input.targetId]

    return Boolean(
      group &&
      group.pieceIds.every((pieceId) => room.state.pieces[pieceId]?.placed)
    )
  }
}
