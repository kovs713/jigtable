import type { Application } from "pixi.js"

import {
  getGroupSnapshot,
  moveGroupFromSnapshot,
} from "@jigtable/jigsaw-core/jigsaw/groups"
import { snapDroppedGroup } from "@jigtable/jigsaw-core/jigsaw/snap"
import type {
  GroupId,
  JigsawState,
  PieceId,
} from "@jigtable/jigsaw-core/jigsaw/types"
import type { CameraController, WorldPoint } from "./camera"
import type { PieceViewSet } from "./pieces"

export interface InteractionController {
  cancelDrag: () => void
  destroy: () => void
}

interface DragState {
  pointerId: number
  groupId: GroupId
  startWorld: WorldPoint
  starts: ReturnType<typeof getGroupSnapshot>
}

function snapshotPieceGroupIds(state: JigsawState): Map<PieceId, GroupId> {
  const result = new Map<PieceId, GroupId>()

  for (const [pieceId, piece] of Object.entries(state.pieces)) {
    if (!piece) continue
    result.set(pieceId as PieceId, piece.groupId)
  }

  return result
}

export function setupPieceInteractions({
  app,
  state,
  camera,
  pieces,
  canDragGroup,
  isServerMode,
  onChange,
  onGroupGrab,
  onGroupMove,
  onGroupDrop,
  // onToggleLock,
}: {
  app: Application
  state: JigsawState
  camera: CameraController
  pieces: PieceViewSet
  canDragGroup?: (groupId: GroupId) => boolean
  isServerMode?: () => boolean
  onChange?: (change?: {
    reason: "move" | "drop" | "snap" | "cancel-drop"
    groupId: GroupId
    affectedPieceIds?: PieceId[]
    groupIdsBeforeSnap?: Map<PieceId, GroupId>
  }) => void
  onGroupGrab?: (groupId: GroupId) => void
  onGroupMove?: (groupId: GroupId) => void
  onGroupDrop?: (groupId: GroupId) => void
  onToggleLock?: (pieceId: PieceId) => void
}): InteractionController {
  const canvas = app.canvas as HTMLCanvasElement
  let drag: DragState | null = null

  function onPointerDown(event: PointerEvent): void {
    if (
      event.button !== 0 ||
      (event.pointerType === "touch" && camera.isTouchGestureActive)
    ) {
      return
    }

    const world = camera.screenToWorld(event.clientX, event.clientY)
    const pieceId = pieces.pickPieceAt(world.x, world.y, {
      includeLocked: true,
    })

    if (!pieceId) {
      return
    }

    if (event.ctrlKey || event.metaKey) {
      //      event.preventDefault()
      //      onToggleLock?.(pieceId)
      //      return
    }

    startDrag(pieceId, event, world)
  }

  function startDrag(
    pieceId: PieceId,
    event: PointerEvent,
    world: WorldPoint
  ): void {
    const piece = state.pieces[pieceId]
    const group = state.groups[piece.groupId]

    if (
      !group ||
      piece.locked ||
      group.locked ||
      canDragGroup?.(piece.groupId) === false
    ) {
      return
    }

    event.preventDefault()
    drag = {
      pointerId: event.pointerId,
      groupId: piece.groupId,
      startWorld: world,
      starts: getGroupSnapshot(state, piece.groupId),
    }

    pieces.raiseGroup(piece.groupId)
    canvas.style.cursor = "grabbing"
    canvas.setPointerCapture(event.pointerId)
    onGroupGrab?.(piece.groupId)
  }

  function onPointerMove(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointerId) {
      return
    }

    if (event.pointerType === "touch" && camera.isTouchGestureActive) {
      cancelDrag({ notifyDrop: true })
      return
    }

    if (canDragGroup?.(drag.groupId) === false) {
      cancelDrag()
      return
    }

    event.preventDefault()
    const world = camera.screenToWorld(event.clientX, event.clientY)
    const movedPieceIds = moveGroupFromSnapshot(
      state,
      drag.starts,
      world.x - drag.startWorld.x,
      world.y - drag.startWorld.y
    )
    pieces.syncPieces(movedPieceIds)
    onGroupMove?.(drag.groupId)
  }

  function stopDrag(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointerId) {
      return
    }

    const stoppedDrag = drag
    drag = null
    canvas.style.cursor = ""

    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId)
    }

    if (isServerMode?.()) {
      onGroupDrop?.(stoppedDrag.groupId)
      onChange?.()
      return
    }

    const groupIdsBeforeSnap = snapshotPieceGroupIds(state)

    const snap = snapDroppedGroup(state, stoppedDrag.groupId)

    pieces.syncPieces(snap.affectedPieceIds)

    onChange?.({
      reason: "snap",
      groupId: stoppedDrag.groupId,
      affectedPieceIds: snap.affectedPieceIds,
      groupIdsBeforeSnap,
    })
  }

  function cancelDrag(options: { notifyDrop?: boolean } = {}): void {
    if (!drag) {
      return
    }

    const cancelledDrag = drag
    drag = null
    canvas.style.cursor = ""

    if (canvas.hasPointerCapture(cancelledDrag.pointerId)) {
      canvas.releasePointerCapture(cancelledDrag.pointerId)
    }

    if (options.notifyDrop) {
      onGroupDrop?.(cancelledDrag.groupId)
      onChange?.()
    }
  }

  canvas.addEventListener("pointerdown", onPointerDown)
  window.addEventListener("pointermove", onPointerMove, { passive: false })
  window.addEventListener("pointerup", stopDrag)
  window.addEventListener("pointercancel", stopDrag)

  return {
    cancelDrag,
    destroy() {
      cancelDrag()
      canvas.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", stopDrag)
      window.removeEventListener("pointercancel", stopDrag)
    },
  }
}
