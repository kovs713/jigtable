import {
  lockGroupIfSolved,
  lockGroupToCorrectPositions,
  mergeGroups,
  translateGroup,
} from "./groups"
import type { GroupId, PieceId, JigsawState } from "./types"

export type SnapKind = "none" | "correct" | "neighbor"

export interface SnapResult {
  kind: SnapKind
  groupId: GroupId
  affectedPieceIds: PieceId[]
}

interface SnapCandidate {
  distanceSquared: number
  deltaX: number
  deltaY: number
}

interface NeighborSnapCandidate extends SnapCandidate {
  neighborGroupId: GroupId
}

export function snapDroppedGroup(
  state: JigsawState,
  groupId: GroupId
): SnapResult {
  const correctSnap = findCorrectSnap(state, groupId)

  if (correctSnap) {
    const movedPieceIds = translateGroup(
      state,
      groupId,
      correctSnap.deltaX,
      correctSnap.deltaY
    )
    const affectedPieceIds = lockGroupToCorrectPositions(state, groupId)
    state.snapCount += 1

    return {
      kind: "correct",
      groupId,
      affectedPieceIds:
        affectedPieceIds.length > 0 ? affectedPieceIds : movedPieceIds,
    }
  }

  const neighborSnap = findNeighborSnap(state, groupId)

  if (neighborSnap) {
    translateGroup(state, groupId, neighborSnap.deltaX, neighborSnap.deltaY)
    const mergedGroupId = mergeGroups(
      state,
      groupId,
      neighborSnap.neighborGroupId
    )
    const affectedPieceIds = [...(state.groups[mergedGroupId]?.pieceIds ?? [])]
    lockGroupIfSolved(state, mergedGroupId)
    state.snapCount += 1

    return {
      kind: "neighbor",
      groupId: mergedGroupId,
      affectedPieceIds,
    }
  }

  return {
    kind: "none",
    groupId,
    affectedPieceIds: [...(state.groups[groupId]?.pieceIds ?? [])],
  }
}

function findCorrectSnap(
  state: JigsawState,
  groupId: GroupId
): SnapCandidate | null {
  const group = state.groups[groupId]

  if (!group || group.locked) {
    return null
  }

  const thresholdSquared = state.config.snapToCorrectDistance ** 2
  let best: SnapCandidate | null = null

  for (const pieceId of group.pieceIds) {
    const piece = state.pieces[pieceId]
    const definition = state.definitions[pieceId]

    if (!piece || !definition) {
      continue
    }

    const deltaX = definition.correctX - piece.x
    const deltaY = definition.correctY - piece.y
    const distanceSquared = deltaX * deltaX + deltaY * deltaY

    if (
      distanceSquared <= thresholdSquared &&
      (!best || distanceSquared < best.distanceSquared)
    ) {
      best = { distanceSquared, deltaX, deltaY }
    }
  }

  return best
}

function findNeighborSnap(
  state: JigsawState,
  groupId: GroupId
): NeighborSnapCandidate | null {
  const group = state.groups[groupId]

  if (!group || group.locked) {
    return null
  }

  const groupPieceIds = new Set(group.pieceIds)
  const thresholdSquared = state.config.snapToNeighborDistance ** 2
  let best: NeighborSnapCandidate | null = null

  for (const pieceId of group.pieceIds) {
    const piece = state.pieces[pieceId]
    const definition = state.definitions[pieceId]

    if (!piece || !definition) {
      continue
    }

    for (const relation of definition.neighbors) {
      if (groupPieceIds.has(relation.neighborId)) {
        continue
      }

      const neighbor = state.pieces[relation.neighborId]

      if (!neighbor) {
        continue
      }

      const expectedX = neighbor.x - relation.offsetX
      const expectedY = neighbor.y - relation.offsetY
      const deltaX = expectedX - piece.x
      const deltaY = expectedY - piece.y
      const distanceSquared = deltaX * deltaX + deltaY * deltaY

      if (
        distanceSquared <= thresholdSquared &&
        (!best || distanceSquared < best.distanceSquared)
      ) {
        best = {
          distanceSquared,
          deltaX,
          deltaY,
          neighborGroupId: neighbor.groupId,
        }
      }
    }
  }

  return best
}
