import type { GroupId, JigsawState, PieceId } from "./types"

export interface GroupAnchor {
  groupId: GroupId
  pieceId: PieceId
  x: number
  y: number
}

export interface PiecePositionSnapshot {
  id: PieceId
  x: number
  y: number
}

export function getGroupPieceIds(
  state: JigsawState,
  groupId: GroupId
): PieceId[] {
  return state.groups[groupId]?.pieceIds ?? []
}

export function getGroupSnapshot(
  state: JigsawState,
  groupId: GroupId
): PiecePositionSnapshot[] {
  const snapshot: PiecePositionSnapshot[] = []

  for (const pieceId of getGroupPieceIds(state, groupId)) {
    const piece = state.pieces[pieceId]

    if (piece) {
      snapshot.push({ id: piece.id, x: piece.x, y: piece.y })
    }
  }

  return snapshot
}

export function moveGroupFromSnapshot(
  state: JigsawState,
  snapshot: PiecePositionSnapshot[],
  deltaX: number,
  deltaY: number
): PieceId[] {
  const movedPieceIds: PieceId[] = []

  for (const start of snapshot) {
    const piece = state.pieces[start.id]

    if (!piece) {
      continue
    }

    piece.x = start.x + deltaX
    piece.y = start.y + deltaY
    piece.placed = false
    movedPieceIds.push(piece.id)
  }

  return movedPieceIds
}

export function getGroupAnchor(
  state: JigsawState,
  groupId: GroupId
): GroupAnchor | null {
  const group = state.groups[groupId]
  const pieceId = group?.pieceIds[0]

  if (!group || !pieceId) {
    return null
  }

  const piece = state.pieces[pieceId]

  if (!piece) {
    return null
  }

  return {
    groupId,
    pieceId,
    x: piece.x,
    y: piece.y,
  }
}

export function moveGroupToAnchor(
  state: JigsawState,
  groupId: GroupId,
  x: number,
  y: number
): PieceId[] {
  const anchor = getGroupAnchor(state, groupId)

  if (!anchor) {
    return []
  }

  return translateGroup(state, groupId, x - anchor.x, y - anchor.y)
}

export function translateGroup(
  state: JigsawState,
  groupId: GroupId,
  deltaX: number,
  deltaY: number
): PieceId[] {
  const group = state.groups[groupId]

  if (!group || group.locked) {
    return []
  }

  const movedPieceIds: PieceId[] = []

  for (const pieceId of group.pieceIds) {
    const piece = state.pieces[pieceId]

    if (!piece) {
      continue
    }

    piece.x += deltaX
    piece.y += deltaY
    piece.placed = false
    movedPieceIds.push(piece.id)
  }

  return movedPieceIds
}

export function mergeGroups(
  state: JigsawState,
  keepGroupId: GroupId,
  mergeGroupId: GroupId
): GroupId {
  if (keepGroupId === mergeGroupId) {
    return keepGroupId
  }

  const keepGroup = state.groups[keepGroupId]
  const mergeGroup = state.groups[mergeGroupId]

  if (!keepGroup || !mergeGroup) {
    return keepGroupId
  }

  const known = new Set(keepGroup.pieceIds)

  for (const pieceId of mergeGroup.pieceIds) {
    if (!known.has(pieceId)) {
      keepGroup.pieceIds.push(pieceId)
      known.add(pieceId)
    }

    const piece = state.pieces[pieceId]

    if (piece) {
      piece.groupId = keepGroupId
    }
  }

  keepGroup.locked = keepGroup.pieceIds.every(
    (pieceId) => state.pieces[pieceId]?.locked
  )
  delete state.groups[mergeGroupId]

  return keepGroupId
}

export function lockGroupToCorrectPositions(
  state: JigsawState,
  groupId: GroupId
): PieceId[] {
  const group = state.groups[groupId]

  if (!group) {
    return []
  }

  const affectedPieceIds: PieceId[] = []

  for (const pieceId of group.pieceIds) {
    const piece = state.pieces[pieceId]
    const definition = state.definitions[pieceId]

    if (!piece || !definition) {
      continue
    }

    piece.x = definition.correctX
    piece.y = definition.correctY
    piece.placed = true
    piece.locked = true
    affectedPieceIds.push(piece.id)
  }

  group.locked = true

  return affectedPieceIds
}

export function lockGroupIfSolved(
  state: JigsawState,
  groupId: GroupId,
  tolerance = 0.5
): boolean {
  const group = state.groups[groupId]

  if (!group) {
    return false
  }

  const solved = group.pieceIds.every((pieceId) => {
    const piece = state.pieces[pieceId]
    const definition = state.definitions[pieceId]

    if (!piece || !definition) {
      return false
    }

    return (
      Math.abs(piece.x - definition.correctX) <= tolerance &&
      Math.abs(piece.y - definition.correctY) <= tolerance
    )
  })

  if (solved) {
    lockGroupToCorrectPositions(state, groupId)
  }

  return solved
}

export function countPlacedPieces(state: JigsawState): number {
  return Object.values(state.pieces).filter((piece) => piece.placed).length
}
