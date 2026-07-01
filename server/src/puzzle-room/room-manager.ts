import type { ServerWebSocket } from "bun"

import type {
  ClientToServerMessage,
  GroupId,
  GroupState,
  PuzzleGroupLock,
  PuzzlePlayer,
  PuzzlePlayerCursor,
  PuzzleRoomSnapshot,
  PuzzleRoomStats,
  PuzzleRoomTimer,
  PieceId,
  PieceState,
  PuzzleState,
  ServerToClientMessage,
} from "@puzzle-shuffle/puzzle-core"
import {
  createImagePuzzleConfig,
  createPuzzleState,
  moveGroupToAnchor,
  PUZZLE_CONFIG_2000,
  scatterAllPieces,
  snapDroppedGroup,
} from "@puzzle-shuffle/puzzle-core"

import type { PuzzleSafeAssetRef } from "@/infra/db/shemas"
import type { PuzzleHistoryStore } from "./history-store"
import type { PuzzleSessionStore } from "./session-store"

const DEV_ASSET_ID = "test_puzzle"
const DEV_IMAGE_URL = "/test_puzzle.png"
const DEV_IMAGE_SIZE = { width: 3168, height: 1782 }
const DEV_ROOM_ID = "dev-room"
const MIN_PIECE_COUNT = 4
const MAX_PIECE_COUNT = 2_000

export interface CreatePuzzleRoomInput {
  imageUrl: string
  assetId?: string
  sourceSize: {
    width: number
    height: number
  }
  pieceCount: number
  assetRef: PuzzleSafeAssetRef
}

export interface PuzzleSocketData {
  roomId?: string
  sessionToken?: string
  player?: PuzzlePlayer
}

export type PuzzleSocket = ServerWebSocket<PuzzleSocketData>

interface PuzzleRoom {
  roomId: string
  assetId: string
  assetRef: PuzzleSafeAssetRef
  imageUrl: string
  state: PuzzleState
  players: Map<string, PuzzlePlayer>
  cursors: Map<string, PuzzlePlayerCursor>
  sockets: Set<PuzzleSocket>
  locks: Map<GroupId, PuzzleGroupLock>
  timer: PuzzleRoomTimer
  createdAt: number
  updatedAt: number
  completedAt?: number
}

export class PuzzleRoomManager {
  private readonly rooms = new Map<string, PuzzleRoom>()

  constructor(
    private readonly sessionStore: PuzzleSessionStore,
    private readonly historyStore: PuzzleHistoryStore
  ) {}

  createRoom(input: CreatePuzzleRoomInput): PuzzleRoomSnapshot {
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

  getRoomSnapshot(roomId: string): PuzzleRoomSnapshot | null {
    const room = this.getRoomForJoin(roomId)

    return room ? toSnapshot(room) : null
  }

  async handleMessage(
    socket: PuzzleSocket,
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

    if (message.type === "cursor:move") {
      this.moveCursor(socket, room, player, message.x, message.y)
      return
    }

    if (message.type === "cursor:hide") {
      this.hideCursor(socket, room, player.id)
    }
  }

  handleClose(socket: PuzzleSocket): void {
    const roomId = socket.data.roomId
    const player = socket.data.player

    if (!roomId || !player) {
      return
    }

    const room = this.rooms.get(roomId)

    if (!room) {
      return
    }

    room.sockets.delete(socket)

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
          console.error("Puzzle participant leave failed", error)
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
    player: PuzzlePlayer
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
    socket: PuzzleSocket,
    roomId: string,
    sessionToken: string
  ): Promise<void> {
    const session = await this.sessionStore.getSession(sessionToken)

    if (!session) {
      send(socket, {
        type: "error",
        code: "session_required",
        message: "Puzzle session not found",
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
    socket: PuzzleSocket,
    room: PuzzleRoom,
    player: PuzzlePlayer,
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
    } satisfies PuzzleGroupLock

    room.locks.set(groupId, lock)
    room.updatedAt = Date.now()
    broadcast(room, { type: "group:locked", lock })
  }

  private moveGroup(
    socket: PuzzleSocket,
    room: PuzzleRoom,
    player: PuzzlePlayer,
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
    room: PuzzleRoom,
    player: PuzzlePlayer,
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

  private releaseGroup(
    room: PuzzleRoom,
    player: PuzzlePlayer,
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
    socket: PuzzleSocket,
    room: PuzzleRoom,
    player: PuzzlePlayer,
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
    } satisfies PuzzlePlayerCursor

    room.cursors.set(player.id, cursor)
    broadcastExcept(room, socket, { type: "cursor:moved", cursor })
  }

  private hideCursor(
    socket: PuzzleSocket,
    room: PuzzleRoom,
    playerId: string
  ): void {
    if (!room.cursors.delete(playerId)) {
      return
    }

    broadcastExcept(room, socket, { type: "cursor:hidden", playerId })
  }

  private pauseSession(room: PuzzleRoom, player: PuzzlePlayer): void {
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

  private resumeSession(room: PuzzleRoom): void {
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

  private releaseAllLocks(room: PuzzleRoom): void {
    for (const [groupId, lock] of room.locks) {
      room.locks.delete(groupId)
      broadcast(room, {
        type: "group:unlocked",
        groupId,
        playerId: lock.playerId,
      })
    }
  }

  private releasePlayerLocks(room: PuzzleRoom, playerId: string): void {
    for (const [groupId, lock] of room.locks) {
      if (lock.playerId === playerId) {
        room.locks.delete(groupId)
        broadcast(room, { type: "group:unlocked", groupId, playerId })
      }
    }
  }

  private playerOwnsLock(
    room: PuzzleRoom,
    playerId: string,
    groupId: GroupId
  ): boolean {
    return room.locks.get(groupId)?.playerId === playerId
  }

  private recordCompletionIfSolved(room: PuzzleRoom): void {
    if (room.completedAt) {
      return
    }

    const stats = getStats(room)

    if (stats.placedPieces < stats.totalPieces) {
      return
    }

    const completedAt = Date.now()
    room.completedAt = completedAt

    void this.historyStore
      .recordCompletion({
        roomId: room.roomId,
        assetRef: room.assetRef,
        elapsedMs: getTimerElapsedMs(room.timer, completedAt),
        pieceCount: stats.totalPieces,
        snapCount: stats.snapCount,
        completedAt: new Date(completedAt),
      })
      .catch((error) =>
        console.error("Puzzle completion history failed", error)
      )
  }

  private getRoomForJoin(roomId: string): PuzzleRoom | null {
    const existing = this.rooms.get(roomId)

    if (existing) {
      return existing
    }

    if (roomId !== DEV_ROOM_ID) {
      return null
    }

    return this.createRoomRecord({
      roomId: DEV_ROOM_ID,
      assetId: DEV_ASSET_ID,
      assetRef: { kind: "dev", assetId: DEV_ASSET_ID },
      imageUrl: DEV_IMAGE_URL,
      sourceSize: DEV_IMAGE_SIZE,
      pieceCount: PUZZLE_CONFIG_2000.rows * PUZZLE_CONFIG_2000.cols,
    })
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
    assetRef: PuzzleSafeAssetRef
    imageUrl: string
    sourceSize: { width: number; height: number }
    pieceCount: number
  }): PuzzleRoom {
    const safePieceCount = clampPieceCount(pieceCount)
    const baseConfig = {
      ...PUZZLE_CONFIG_2000,
      rows: 1,
      cols: safePieceCount,
    }

    const state = createPuzzleState(
      createImagePuzzleConfig(baseConfig, sourceSize)
    )
    scatterAllPieces(state)

    const now = Date.now()
    const room = {
      roomId,
      assetId,
      assetRef,
      imageUrl,
      state,
      players: new Map<string, PuzzlePlayer>(),
      cursors: new Map<string, PuzzlePlayerCursor>(),
      sockets: new Set<PuzzleSocket>(),
      locks: new Map<GroupId, PuzzleGroupLock>(),
      timer: {
        elapsedMs: 0,
        paused: false,
        updatedAt: now,
      },
      createdAt: now,
      updatedAt: now,
    } satisfies PuzzleRoom

    this.rooms.set(roomId, room)

    return room
  }
}

function createRoomId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12)
}

function clampPieceCount(value: number): number {
  if (!Number.isFinite(value)) {
    return PUZZLE_CONFIG_2000.rows * PUZZLE_CONFIG_2000.cols
  }

  return Math.max(MIN_PIECE_COUNT, Math.min(MAX_PIECE_COUNT, Math.round(value)))
}

function toSnapshot(room: PuzzleRoom): PuzzleRoomSnapshot {
  return {
    roomId: room.roomId,
    puzzle: {
      assetId: room.assetId,
      imageUrl: room.imageUrl,
      config: room.state.config,
    },
    pieces: room.state.pieces,
    groups: room.state.groups,
    players: [...room.players.values()],
    locks: [...room.locks.values()],
    cursors: [...room.cursors.values()],
    timer: room.timer,
    stats: getStats(room),
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
  }
}

function getStats(room: PuzzleRoom): PuzzleRoomStats {
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

function updatePlayerLocks(room: PuzzleRoom, player: PuzzlePlayer): void {
  for (const [groupId, lock] of room.locks) {
    if (lock.playerId === player.id) {
      room.locks.set(groupId, { ...lock, playerName: player.name })
    }
  }
}

function updatePlayerCursor(room: PuzzleRoom, player: PuzzlePlayer): void {
  const cursor = room.cursors.get(player.id)

  if (!cursor) {
    return
  }

  const nextCursor = {
    ...cursor,
    playerName: player.name,
    color: player.color,
    updatedAt: Date.now(),
  } satisfies PuzzlePlayerCursor

  room.cursors.set(player.id, nextCursor)
  broadcast(room, { type: "cursor:moved", cursor: nextCursor })
}

function getTimerElapsedMs(timer: PuzzleRoomTimer, now = Date.now()): number {
  if (timer.paused) {
    return timer.elapsedMs
  }

  return timer.elapsedMs + Math.max(0, now - timer.updatedAt)
}

function pickPieces(
  state: PuzzleState,
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
  state: PuzzleState,
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
  state: PuzzleState,
  groupId: GroupId
): { x: number; y: number } | null {
  const group = state.groups[groupId]
  const pieceId = group?.pieceIds[0]
  const piece = pieceId ? state.pieces[pieceId] : null

  return piece ? { x: piece.x, y: piece.y } : null
}

function send(socket: PuzzleSocket, message: ServerToClientMessage): void {
  socket.send(JSON.stringify(message))
}

function broadcast(room: PuzzleRoom, message: ServerToClientMessage): void {
  const payload = JSON.stringify(message)

  for (const socket of room.sockets) {
    socket.send(payload)
  }
}

function broadcastExcept(
  room: PuzzleRoom,
  except: PuzzleSocket,
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
