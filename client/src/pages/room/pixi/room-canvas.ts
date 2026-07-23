import type { Texture } from "pixi.js"

import {
  createImageJigsawConfig,
  getPlayAreaBounds,
} from "@jigtable/core/config"
import { createJigsawState } from "@jigtable/core/generate"
import { getGroupAnchor, moveGroupToAnchor } from "@jigtable/core/groups"
import type {
  ClientToServerMessage,
  JigsawGroupLock,
  JigsawLock,
  Player,
  RoomSnapshot,
  ServerToClientMessage,
} from "@jigtable/core/protocol"
import {
  arrangeLoosePieces,
  scatterAllPieces,
  type ArrangeLoosePiecesMode,
} from "@jigtable/core/scatter"
import type {
  GroupId,
  JigsawConfig,
  JigsawState,
  PieceId,
} from "@jigtable/core/types"

import type { JigsawMultiplayerClient } from "@/features/room/multiplayer"

import { loadImageTexture } from "../image-texture"
import { createCameraController } from "./camera"
import { createJigsawPixiApp, destroyJigsawPixiApp } from "./create-app"
import { createJigsawScene, readSceneColors } from "./create-scene"
import type { RemoteCursorViewSet } from "./cursors"
import { createRemoteCursorViews, setupCursorBroadcast } from "./cursors"
import type { JigsawStats } from "./debug"
import { createDebugTicker, getJigsawStats } from "./debug"
import type { InteractionController } from "./interactions"
import { setupPieceInteractions } from "./interactions"
import type { LockOverlayRenderer } from "./locks"
import { createLockOverlayRenderer } from "./locks"
import type { PieceViewSet } from "./pieces"
import { createPieceViews } from "./pieces"
import type { PingController } from "./pings"
import { createPingController } from "./pings"

const GROUP_MOVE_SEND_INTERVAL_MS = 33
const PIECE_HIGHLIGHT_DURATION_MS = 900

export type { JigsawStats } from "./debug"

type InteractionChange = {
  reason: "move" | "drop" | "snap" | "cancel-drop"
  groupId: GroupId
  affectedPieceIds?: PieceId[]
  groupIdsBeforeSnap?: Map<PieceId, GroupId>
}

export type RoomCanvasZoom = "in" | "out" | "fit"

export interface JigsawRoomCanvas {
  applyServerMessage(message: ServerToClientMessage): void
  setPreviewVisible(visible: boolean): void
  highlightPieces(): void
  arrangePieces(mode: ArrangeLoosePiecesMode): void
  changeZoom(action: RoomCanvasZoom): void
  quickSolve(): void
  refreshTheme(): void
  getCursorPosition(): { x: number; y: number } | null
  destroy(): void
}

export interface CreateJigsawRoomCanvasOptions {
  host: HTMLElement
  themeRoot: HTMLElement
  imageUrl: string
  fallbackConfig: JigsawConfig
  snapshot: RoomSnapshot | null
  isCancelled(): boolean
  getPlayer(): Pick<Player, "id" | "name" | "color">
  isPaused(): boolean
  isConnected(): boolean
  send(message: ClientToServerMessage): void
  prepareTheme(averageLuminance: number | null): void
  onStats(stats: JigsawStats): void
  onHighlightChange(highlighted: boolean): void
  onCanvasPointerDown(): void
}

export interface JigsawRoomCanvasStart {
  canvas: JigsawRoomCanvas
  initialStats: JigsawStats
}

export async function createJigsawRoomCanvas(
  options: CreateJigsawRoomCanvasOptions
): Promise<JigsawRoomCanvasStart> {
  const rollback: Array<() => void> = []

  try {
    const app = await createJigsawPixiApp(options.host)
    rollback.push(() => destroyJigsawPixiApp(app))
    throwIfCancelled(options)

    const loadedImage = await loadImageTexture(options.imageUrl)
    const imageTexture = loadedImage.texture
    rollback.push(() => imageTexture.destroy(true))
    throwIfCancelled(options)

    options.prepareTheme(loadedImage.averageLuminance)

    const state = createInitialState(options, imageTexture)
    const colors = readSceneColors(options.themeRoot)
    const scene = createJigsawScene(app, state, imageTexture, colors)
    const pieces = createPieceViews(
      scene.piecesLayer,
      state,
      imageTexture,
      colors.pieceHighlight
    )
    rollback.push(() => pieces.destroy())

    const groupLocks = new Map<string, JigsawGroupLock>()
    const toggleLocks = new Map<string, JigsawLock>()
    let lastMoveSentAt = 0
    let highlightTimer: number | null = null
    let destroyed = false

    const camera = createCameraController(app, scene.world, state.config, {
      canStartPrimaryPan(event, world) {
        if (event.altKey && options.isConnected()) {
          return false
        }

        const pieceId = pieces.pickPieceAt(world.x, world.y, {
          includeLocked: true,
        })

        if (!pieceId) {
          return true
        }

        const piece = state.pieces[pieceId]

        return Boolean(
          piece && (piece.locked || state.groups[piece.groupId]?.locked)
        )
      },
    })
    rollback.push(() => camera.destroy())
    camera.fitToRect(getPlayAreaBounds(state.config))

    const cursors = createRemoteCursorViews(app, scene.overlayLayer, camera)
    rollback.push(() => cursors.destroy())

    if (options.snapshot) {
      cursors.syncCursors(options.snapshot.cursors, options.getPlayer().id)
    }

    const pings = createPingController(app, scene.overlayLayer, camera)
    rollback.push(() => pings.destroy())

    let lockOverlays: LockOverlayRenderer | null = null

    function emitStats(): void {
      if (destroyed) {
        return
      }

      options.onStats(getJigsawStats(state, app.ticker.FPS || 0, camera.zoom))
    }

    function syncDerivedRoomViews(change?: InteractionChange): void {
      if (
        change?.reason === "snap" &&
        change.affectedPieceIds &&
        change.groupIdsBeforeSnap
      ) {
        retargetLocksAfterSnap(
          state,
          toggleLocks,
          change.affectedPieceIds,
          change.groupIdsBeforeSnap
        )
      }

      emitStats()
      lockOverlays?.update(toggleLocks)
      app.render()
    }

    const interactions = setupPieceInteractions({
      app,
      state,
      camera,
      pieces,
      canDragGroup(groupId) {
        if (options.isPaused()) {
          return false
        }

        const lock = groupLocks.get(groupId)

        if (lock && lock.playerId !== options.getPlayer().id) {
          return false
        }

        const toggleLock = toggleLocks.get(`group:${groupId}`)

        if (toggleLock && toggleLock.playerId !== options.getPlayer().id) {
          return false
        }

        const group = state.groups[groupId]

        if (group) {
          for (const pieceId of group.pieceIds) {
            const pieceLock = toggleLocks.get(`piece:${pieceId}`)

            if (pieceLock && pieceLock.playerId !== options.getPlayer().id) {
              return false
            }
          }
        }

        return true
      },
      isServerMode: options.isConnected,
      onChange: syncDerivedRoomViews,
      onToggleLock(pieceId) {
        const piece = state.pieces[pieceId]

        if (!piece || piece.placed) {
          return
        }

        const group = state.groups[piece.groupId]

        if (!group) {
          return
        }

        if (group.pieceIds.length > 1) {
          options.send({
            type: "room:lock-toggle",
            commandId: crypto.randomUUID(),
            targetType: "group",
            targetId: piece.groupId,
          })
        } else {
          options.send({
            type: "room:lock-toggle",
            commandId: crypto.randomUUID(),
            targetType: "piece",
            targetId: pieceId,
          })
        }
      },
      onGroupGrab(groupId) {
        options.send({ type: "group:grab", groupId })
      },
      onGroupMove(groupId) {
        lockOverlays?.update(toggleLocks)

        if (!options.isConnected()) {
          return
        }

        const now = performance.now()

        if (now - lastMoveSentAt < GROUP_MOVE_SEND_INTERVAL_MS) {
          return
        }

        const anchor = getGroupAnchor(state, groupId)

        if (!anchor) {
          return
        }

        lastMoveSentAt = now
        options.send({
          type: "group:move",
          groupId,
          x: anchor.x,
          y: anchor.y,
        })
      },
      onGroupDrop(groupId) {
        const anchor = getGroupAnchor(state, groupId)

        if (!anchor) {
          options.send({ type: "group:release", groupId })
          return
        }

        lastMoveSentAt = 0
        options.send({
          type: "group:drop",
          commandId: crypto.randomUUID(),
          groupId,
          x: anchor.x,
          y: anchor.y,
        })
      },
    })
    rollback.push(() => interactions.destroy())

    const connectionAdapter = createConnectionAdapter(options)
    const cursorBroadcast = setupCursorBroadcast({
      app,
      camera,
      getConnection() {
        return connectionAdapter
      },
    })
    rollback.push(() => cursorBroadcast.destroy())

    const onCanvasPointerDown = (): void => {
      options.onCanvasPointerDown()
    }

    app.canvas.addEventListener("pointerdown", onCanvasPointerDown)
    rollback.push(() =>
      app.canvas.removeEventListener("pointerdown", onCanvasPointerDown)
    )

    function onAltClickPing(event: PointerEvent): void {
      if (!(event.altKey && event.button === 0) || !options.isConnected()) {
        return
      }

      event.preventDefault()

      const world = camera.screenToWorld(event.clientX, event.clientY)
      const player = options.getPlayer()
      const id = crypto.randomUUID()

      options.send({
        type: "room:ping",
        commandId: crypto.randomUUID(),
        id,
        x: world.x,
        y: world.y,
      })
      void pings.showPing(
        world.x,
        world.y,
        player.id,
        player.name,
        player.color
      )
    }

    app.canvas.addEventListener("pointerdown", onAltClickPing)
    rollback.push(() =>
      app.canvas.removeEventListener("pointerdown", onAltClickPing)
    )

    lockOverlays = createLockOverlayRenderer(scene.lockLayer, state, pieces)
    rollback.push(() => lockOverlays?.destroy())

    const debug = createDebugTicker(app, state, camera, options.onStats)
    rollback.push(() => debug.destroy())

    const initialStats = getJigsawStats(state, app.ticker.FPS || 0, camera.zoom)

    syncDerivedRoomViews()
    rollback.length = 0

    const canvas: JigsawRoomCanvas = {
      applyServerMessage(message) {
        if (destroyed) {
          return
        }

        applyServerMessage({
          message,
          state,
          pieces,
          cursors,
          pings,
          interactions,
          lockOverlays,
          groupLocks,
          toggleLocks,
          getPlayer: options.getPlayer,
          emitStats,
        })
      },
      setPreviewVisible(visible) {
        if (destroyed) {
          return
        }

        scene.setPreviewVisible(visible)
        options.send({
          type: visible ? "room:preview:open" : "room:preview:close",
          commandId: crypto.randomUUID(),
        })
      },
      highlightPieces() {
        if (destroyed) {
          return
        }

        if (highlightTimer !== null) {
          window.clearTimeout(highlightTimer)
        }

        pieces.setAllHighlighted(true)
        options.onHighlightChange(true)
        highlightTimer = window.setTimeout(() => {
          if (!destroyed) {
            pieces.setAllHighlighted(false)
            options.onHighlightChange(false)
          }

          highlightTimer = null
        }, PIECE_HIGHLIGHT_DURATION_MS)
      },
      arrangePieces(mode) {
        if (destroyed || options.isPaused()) {
          return
        }

        if (options.isConnected()) {
          options.send({ type: "groups:arrange", mode })
          return
        }

        const movedPieceIds = arrangeLoosePieces(state, mode)

        if (movedPieceIds.length === 0) {
          return
        }

        interactions.cancelDrag()
        pieces.syncPieces(movedPieceIds)
        emitStats()
      },
      changeZoom(action) {
        if (destroyed) {
          return
        }

        if (action === "in") {
          camera.zoomIn()
        } else if (action === "out") {
          camera.zoomOut()
        } else {
          camera.resetView()
        }

        emitStats()
      },
      quickSolve() {
        if (destroyed) {
          return
        }

        for (const [pieceId, piece] of Object.entries(state.pieces)) {
          const definition = state.definitions[pieceId]

          if (!definition) {
            continue
          }

          piece.x = definition.correctX
          piece.y = definition.correctY
          piece.placed = true
          piece.locked = true
        }

        for (const group of Object.values(state.groups)) {
          group.locked = true
        }

        interactions.cancelDrag()
        pieces.syncAll()
        emitStats()
      },
      refreshTheme() {
        if (destroyed) {
          return
        }

        const nextColors = readSceneColors(options.themeRoot)
        scene.setColors(nextColors)
        pieces.setHighlightColor(nextColors.pieceHighlight)
      },
      getCursorPosition() {
        if (destroyed) {
          return null
        }

        return cursorBroadcast.getLastPosition()
      },
      destroy() {
        if (destroyed) {
          return
        }

        destroyed = true

        if (highlightTimer !== null) {
          window.clearTimeout(highlightTimer)
          highlightTimer = null
        }

        interactions.destroy()
        cursorBroadcast.destroy()
        pings.destroy()
        lockOverlays.destroy()
        debug.destroy()
        camera.destroy()
        cursors.destroy()
        pieces.destroy()
        imageTexture.destroy(true)
        app.canvas.removeEventListener("pointerdown", onCanvasPointerDown)
        app.canvas.removeEventListener("pointerdown", onAltClickPing)
        destroyJigsawPixiApp(app)
      },
    }

    return { canvas, initialStats }
  } catch (error) {
    for (let index = rollback.length - 1; index >= 0; index--) {
      try {
        rollback[index]()
      } catch {
        // Preserve the initialization error while releasing acquired resources.
      }
    }

    throw error
  }
}

function throwIfCancelled(options: CreateJigsawRoomCanvasOptions): void {
  if (options.isCancelled()) {
    throw new Error("Room canvas initialization cancelled")
  }
}

function createInitialState(
  options: CreateJigsawRoomCanvasOptions,
  imageTexture: Texture
): JigsawState {
  const config =
    options.snapshot?.jigsaw.config ??
    createImageJigsawConfig(options.fallbackConfig, {
      width: imageTexture.width,
      height: imageTexture.height,
    })
  const state = createJigsawState(config)

  if (options.snapshot) {
    state.pieces = structuredClone(options.snapshot.pieces)
    state.groups = structuredClone(options.snapshot.groups)
    state.snapCount = options.snapshot.stats.snapCount
  } else {
    scatterAllPieces(state)
  }

  return state
}

function createConnectionAdapter(
  options: CreateJigsawRoomCanvasOptions
): JigsawMultiplayerClient {
  return {
    send: options.send,
    isConnected: options.isConnected,
    requestState() {},
    destroy() {},
  }
}

function applyServerMessage({
  message,
  state,
  pieces,
  cursors,
  pings,
  interactions,
  lockOverlays,
  groupLocks,
  toggleLocks,
  getPlayer,
  emitStats,
}: {
  message: ServerToClientMessage
  state: JigsawState
  pieces: PieceViewSet
  cursors: RemoteCursorViewSet
  pings: PingController
  interactions: InteractionController
  lockOverlays: LockOverlayRenderer
  groupLocks: Map<string, JigsawGroupLock>
  toggleLocks: Map<string, JigsawLock>
  getPlayer: CreateJigsawRoomCanvasOptions["getPlayer"]
  emitStats(): void
}): void {
  const player = getPlayer()

  if (message.type === "cursor:moved") {
    if (message.cursor.playerId !== player.id) {
      cursors.applyCursor(message.cursor)
    }

    return
  }

  if (message.type === "cursor:hidden") {
    cursors.removeCursor(message.playerId)
    return
  }

  if (message.type === "session:paused") {
    interactions.cancelDrag()
    return
  }

  if (message.type === "room:state") {
    groupLocks.clear()
    toggleLocks.clear()

    for (const lock of message.state.locks) {
      toggleLocks.set(`${lock.targetType}:${lock.targetId}`, lock)
    }

    lockOverlays.update(toggleLocks)
    cursors.syncCursors(message.state.cursors, player.id)

    if (message.state.timer.paused) {
      interactions.cancelDrag()
    }

    applyRoomState(state, pieces, message.state)
    return
  }

  if (message.type === "player:left") {
    cursors.removeCursor(message.playerId)
    return
  }

  if (message.type === "room:pinged") {
    if (message.userId !== player.id) {
      void pings.showPing(
        message.x,
        message.y,
        message.userId,
        message.userName ?? "Player",
        message.userColor ?? "#ffffff"
      )
    }

    return
  }

  if (message.type === "chat:message") {
    if (message.message.player.id !== player.id) {
      cursors.showChatMessage(message.message)
    }

    return
  }

  if (message.type === "group:locked") {
    groupLocks.set(message.lock.groupId, message.lock)
    return
  }

  if (message.type === "group:unlocked") {
    groupLocks.delete(message.groupId)
    return
  }

  if (message.type === "room:lock-updated") {
    const key = `${message.targetType}:${message.targetId}`

    if (message.lockedBy) {
      toggleLocks.set(key, {
        targetType: message.targetType,
        targetId: message.targetId,
        playerId: message.lockedBy.userId,
        playerName: message.lockedBy.name,
        playerColor: message.lockedBy.color,
        lockedAt: Date.now(),
        connectionId: "",
      })
    } else {
      toggleLocks.delete(key)
    }

    lockOverlays.update(toggleLocks)
    return
  }

  if (message.type === "group:moved") {
    const movedPieceIds = moveGroupToAnchor(
      state,
      message.groupId,
      message.x,
      message.y
    )
    pieces.syncPieces(movedPieceIds)
    emitStats()
    return
  }

  if (message.type === "groups:merged" || message.type === "pieces:placed") {
    applyStatePatch(
      state,
      pieces,
      message.pieces,
      message.groups,
      message.type === "groups:merged" ? message.removedGroupIds : [],
      message.snapCount
    )
    return
  }

  if (message.type === "groups:arranged") {
    for (const [pieceId, piece] of Object.entries(message.pieces)) {
      state.pieces[pieceId] = structuredClone(piece)
    }

    interactions.cancelDrag()
    pieces.syncPieces(Object.keys(message.pieces))
    emitStats()
    return
  }

  if (message.type === "error" && message.code === "session_paused") {
    interactions.cancelDrag()
  }
}

function applyRoomState(
  state: JigsawState,
  pieces: PieceViewSet,
  snapshot: RoomSnapshot
): void {
  state.pieces = structuredClone(snapshot.pieces)
  state.groups = structuredClone(snapshot.groups)
  state.snapCount = snapshot.stats.snapCount
  pieces.syncAll()
}

function applyStatePatch(
  state: JigsawState,
  pieceViews: PieceViewSet,
  pieces: RoomSnapshot["pieces"],
  groups: RoomSnapshot["groups"],
  removedGroupIds: string[],
  snapCount: number
): void {
  const affectedPieceIds = Object.keys(pieces)

  for (const [pieceId, piece] of Object.entries(pieces)) {
    state.pieces[pieceId] = structuredClone(piece)
  }

  for (const groupId of removedGroupIds) {
    delete state.groups[groupId]
  }

  for (const [groupId, group] of Object.entries(groups)) {
    state.groups[groupId] = structuredClone(group)
  }

  state.snapCount = snapCount
  pieceViews.syncPieces(affectedPieceIds)
}

function findLockForMergedPieces(
  locks: Map<string, JigsawLock>,
  affectedPieceIds: PieceId[],
  oldGroupIds: Set<GroupId>
): JigsawLock | null {
  for (const oldGroupId of oldGroupIds) {
    const groupLock = locks.get(`group:${oldGroupId}`)

    if (groupLock) {
      return groupLock
    }
  }

  for (const pieceId of affectedPieceIds) {
    const pieceLock = locks.get(`piece:${pieceId}`)

    if (pieceLock) {
      return pieceLock
    }
  }

  return null
}

function retargetLocksAfterSnap(
  state: JigsawState,
  locks: Map<string, JigsawLock>,
  affectedPieceIds: PieceId[],
  groupIdsBeforeSnap: Map<PieceId, GroupId>
): void {
  if (affectedPieceIds.length === 0) {
    return
  }

  const oldGroupIds = new Set<GroupId>()
  const newGroupIds = new Set<GroupId>()
  const renderablePieceIds: PieceId[] = []

  for (const pieceId of affectedPieceIds) {
    const oldGroupId = groupIdsBeforeSnap.get(pieceId)
    const piece = state.pieces[pieceId]

    if (oldGroupId) {
      oldGroupIds.add(oldGroupId)
    }

    if (!piece) {
      continue
    }

    if (!piece.placed) {
      newGroupIds.add(piece.groupId)
      renderablePieceIds.push(pieceId)
    }
  }

  const lockToKeep = findLockForMergedPieces(
    locks,
    affectedPieceIds,
    oldGroupIds
  )

  if (!lockToKeep) {
    return
  }

  for (const oldGroupId of oldGroupIds) {
    locks.delete(`group:${oldGroupId}`)
  }

  for (const pieceId of affectedPieceIds) {
    locks.delete(`piece:${pieceId}`)
  }

  if (renderablePieceIds.length === 0 || newGroupIds.size !== 1) {
    return
  }

  const [newGroupId] = [...newGroupIds]

  locks.set(`group:${newGroupId}`, {
    ...lockToKeep,
    targetType: "group",
    targetId: newGroupId,
  })
}
