import { getPuzzleBounds, getScatterVisualMargin } from "./config"
import { translateGroup } from "./groups"
import type {
  GroupId,
  GroupState,
  PieceId,
  PuzzleState,
  WorldRect,
} from "./types"

export function scatterAllPieces(
  state: PuzzleState,
  seed = state.config.seed
): void {
  scatterGroups(state, Object.keys(state.groups), seed, true)
}

export function scatterUnsolvedGroups(
  state: PuzzleState,
  seed = state.config.seed
): void {
  const groupIds = Object.values(state.groups)
    .filter(
      (group) =>
        !group.locked &&
        group.pieceIds.some((pieceId) => !state.pieces[pieceId]?.placed)
    )
    .map((group) => group.id)

  scatterGroups(state, groupIds, seed, false)
}

function scatterGroups(
  state: PuzzleState,
  groupIds: GroupId[],
  seed: number,
  resetSolvedFlags: boolean
): void {
  const random = createSeededRandom(seed)
  const board = getPuzzleBounds(state.config)
  const groups = groupIds
    .map((groupId) => state.groups[groupId])
    .filter(
      (group): group is GroupState =>
        group !== undefined &&
        (resetSolvedFlags || !group.locked) &&
        group.pieceIds.length > 0
    )

  if (groups.length === 0) {
    return
  }

  const margin = getScatterVisualMargin(state.config)
  const gap = state.config.scatterGap
  const boundsByGroup = new Map<GroupId, WorldRect>()
  let maxWidth = 0
  let maxHeight = 0

  for (const group of groups) {
    const bounds = getGroupBounds(state, group.pieceIds, margin)
    boundsByGroup.set(group.id, bounds)
    maxWidth = Math.max(maxWidth, bounds.width)
    maxHeight = Math.max(maxHeight, bounds.height)
  }

  const slotWidth = maxWidth + gap
  const slotHeight = maxHeight + gap
  const slots = createScatterSlots(
    board,
    groups.length,
    slotWidth,
    slotHeight,
    gap
  )
  shuffle(slots, random)

  for (let index = 0; index < groups.length; index++) {
    const group = groups[index]
    const bounds = group ? boundsByGroup.get(group.id) : null
    const slot = slots[index]

    if (!group || !bounds || !slot) {
      continue
    }

    if (resetSolvedFlags) {
      group.locked = false

      for (const pieceId of group.pieceIds) {
        const piece = state.pieces[pieceId]

        if (!piece) {
          continue
        }

        piece.placed = false
        piece.locked = false
      }
    }

    translateGroup(state, group.id, slot.x - bounds.x, slot.y - bounds.y)
  }
}

function getGroupBounds(
  state: PuzzleState,
  pieceIds: PieceId[],
  margin: number
): WorldRect {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const pieceId of pieceIds) {
    const piece = state.pieces[pieceId]
    const definition = state.definitions[pieceId]

    if (!piece || !definition) {
      continue
    }

    minX = Math.min(minX, piece.x - margin)
    minY = Math.min(minY, piece.y - margin)
    maxX = Math.max(maxX, piece.x + definition.width + margin)
    maxY = Math.max(maxY, piece.y + definition.height + margin)
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function createScatterSlots(
  board: WorldRect,
  count: number,
  slotWidth: number,
  slotHeight: number,
  gap: number
): Array<{ x: number; y: number }> {
  const slots: Array<{ x: number; y: number }> = []
  const boardSlotsX = Math.max(1, Math.ceil(board.width / slotWidth))
  const boardSlotsY = Math.max(1, Math.ceil(board.height / slotHeight))
  const blocked = {
    x: board.x - gap,
    y: board.y - gap,
    width: board.width + gap * 2,
    height: board.height + gap * 2,
  }
  let ring = 1

  while (slots.length < count) {
    for (let gridY = -ring; gridY < boardSlotsY + ring; gridY++) {
      for (let gridX = -ring; gridX < boardSlotsX + ring; gridX++) {
        const isPerimeter =
          gridX === -ring ||
          gridY === -ring ||
          gridX === boardSlotsX + ring - 1 ||
          gridY === boardSlotsY + ring - 1

        if (!isPerimeter) {
          continue
        }

        const slot = {
          x: board.x + gridX * slotWidth,
          y: board.y + gridY * slotHeight,
        }

        if (
          !rectsOverlap(
            { ...slot, width: slotWidth, height: slotHeight },
            blocked
          )
        ) {
          slots.push(slot)
        }
      }
    }

    ring += 1
  }

  return slots
}

function rectsOverlap(a: WorldRect, b: WorldRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

function shuffle<T>(items: T[], random: () => number): void {
  for (let index = items.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1))
    const item = items[index]
    const swap = items[swapIndex]

    if (item !== undefined && swap !== undefined) {
      items[index] = swap
      items[swapIndex] = item
    }
  }
}

function createSeededRandom(seed: number): () => number {
  let value = seed >>> 0

  return () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0
    return value / 0x1_0000_0000
  }
}
