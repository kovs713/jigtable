import { getJigsawBounds, getScatterVisualMargin } from "./config"
import { translateGroup } from "./groups"
import type {
  GroupId,
  GroupState,
  JigsawState,
  PieceId,
  WorldRect,
} from "./types"

export function scatterAllPieces(
  state: JigsawState,
  seed = state.config.seed
): void {
  scatterGroups(state, Object.keys(state.groups), seed, true)
}

export function scatterUnsolvedGroups(
  state: JigsawState,
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

export type ArrangeLoosePiecesMode =
  | "perimeter"
  | "top"
  | "right"
  | "bottom"
  | "left"

export function arrangeLoosePieces(
  state: JigsawState,
  mode: ArrangeLoosePiecesMode
): PieceId[] {
  const board = getJigsawBounds(state.config)
  const groups = Object.values(state.groups).filter(
    (group): group is GroupState =>
      !group.locked &&
      group.pieceIds.length > 0 &&
      group.pieceIds.some((pieceId) => !state.pieces[pieceId]?.placed)
  )

  if (groups.length === 0) {
    return []
  }

  const margin = getScatterVisualMargin(state.config)
  const gap = state.config.scatterGap
  const boundsByGroup = new Map<GroupId, WorldRect>()

  for (const group of groups) {
    const bounds = getGroupBounds(state, group.pieceIds, margin)
    boundsByGroup.set(group.id, bounds)
  }

  const saveZone = {
    x: board.x,
    y: board.y,
    width: board.width,
    height: board.height,
  }

  const arrangedGroups = groups.filter((group) => {
    const bounds = boundsByGroup.get(group.id)
    if (!bounds) return false
    return !rectsOverlap(bounds, saveZone)
  })

  if (arrangedGroups.length === 0) {
    return []
  }

  shuffle(
    arrangedGroups,
    createSeededRandom(state.config.seed + modeSeed(mode))
  )
  const slots = createArrangeSlots(
    board,
    arrangedGroups,
    boundsByGroup,
    gap,
    mode
  )
  const affectedPieceIds: PieceId[] = []

  for (let index = 0; index < arrangedGroups.length; index++) {
    const group = arrangedGroups[index]
    const bounds = group ? boundsByGroup.get(group.id) : null
    const slot = slots[index]

    if (!group || !bounds || !slot) {
      continue
    }

    affectedPieceIds.push(
      ...translateGroup(state, group.id, slot.x - bounds.x, slot.y - bounds.y)
    )
  }

  return affectedPieceIds
}

function scatterGroups(
  state: JigsawState,
  groupIds: GroupId[],
  seed: number,
  resetSolvedFlags: boolean
): void {
  const random = createSeededRandom(seed)
  const board = getJigsawBounds(state.config)
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
  state: JigsawState,
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

function createArrangeSlots(
  board: WorldRect,
  groups: GroupState[],
  boundsByGroup: Map<GroupId, WorldRect>,
  gap: number,
  mode: ArrangeLoosePiecesMode
): Array<{ x: number; y: number }> {
  const baseBounds = getBaseBounds(boundsByGroup)
  const candidates = createBalancedPerimeterSlots(
    board,
    groups.length,
    baseBounds.width + gap,
    baseBounds.height + gap,
    gap
  )
  const sortedCandidates =
    mode === "perimeter"
      ? candidates.sort((a, b) => a.perimeterScore - b.perimeterScore)
      : candidates.sort((a, b) => getSideScore(a, mode) - getSideScore(b, mode))

  return packGroupsIntoSlots(groups, boundsByGroup, sortedCandidates, gap)
}

interface ArrangeSlot {
  x: number
  y: number
  top: number
  right: number
  bottom: number
  left: number
  perimeterScore: number
}

function createBalancedPerimeterSlots(
  board: WorldRect,
  count: number,
  slotWidth: number,
  slotHeight: number,
  gap: number
): ArrangeSlot[] {
  const slots: ArrangeSlot[] = []
  const columns = Math.max(1, Math.ceil(board.width / slotWidth))
  const rows = Math.max(1, Math.ceil(board.height / slotHeight))
  let ring = 1

  while (slots.length < count * 4) {
    for (let gridY = -ring; gridY < rows + ring; gridY++) {
      for (let gridX = -ring; gridX < columns + ring; gridX++) {
        const isPerimeter =
          gridX === -ring ||
          gridY === -ring ||
          gridX === columns + ring - 1 ||
          gridY === rows + ring - 1

        if (!isPerimeter) {
          continue
        }

        const x = board.x + gridX * slotWidth
        const y = board.y + gridY * slotHeight
        const top = Math.max(0, board.y - y)
        const right = Math.max(0, x + slotWidth - (board.x + board.width))
        const bottom = Math.max(0, y + slotHeight - (board.y + board.height))
        const left = Math.max(0, board.x - x)
        const outside = top + right + bottom + left

        if (outside <= gap) {
          continue
        }

        slots.push({
          x,
          y,
          top,
          right,
          bottom,
          left,
          perimeterScore: ring + getCornerPenalty(top, right, bottom, left),
        })
      }
    }

    ring += 1
  }

  return slots
}

function getSideScore(
  slot: ArrangeSlot,
  side: Exclude<ArrangeLoosePiecesMode, "perimeter">
): number {
  const primary = slot[side]
  const opposite =
    side === "top"
      ? slot.bottom
      : side === "right"
        ? slot.left
        : side === "bottom"
          ? slot.top
          : slot.right
  const adjacent =
    side === "top" || side === "bottom"
      ? Math.min(slot.left, slot.right)
      : Math.min(slot.top, slot.bottom)
  const sideMiss = primary === 0 ? 10_000 : 0

  return sideMiss + primary * 0.35 + opposite * 2 + adjacent * 0.7
}

function getCornerPenalty(
  top: number,
  right: number,
  bottom: number,
  left: number
): number {
  const outsideSides = [top, right, bottom, left].filter((value) => value > 0)

  return outsideSides.length > 1 ? 0.35 : 0
}

function packGroupsIntoSlots(
  groups: GroupState[],
  boundsByGroup: Map<GroupId, WorldRect>,
  candidates: ArrangeSlot[],
  gap: number
): Array<{ x: number; y: number }> {
  const slots: Array<{ x: number; y: number }> = []
  const occupied: WorldRect[] = []

  for (const group of groups) {
    const bounds = boundsByGroup.get(group.id)

    if (!bounds) {
      slots.push({ x: 0, y: 0 })
      continue
    }

    const slot = candidates.find((candidate) => {
      const rect = {
        x: candidate.x,
        y: candidate.y,
        width: bounds.width + gap,
        height: bounds.height + gap,
      }

      return occupied.every((taken) => !rectsOverlap(rect, taken))
    })

    if (!slot) {
      slots.push({ x: bounds.x, y: bounds.y })
      continue
    }

    slots.push({ x: slot.x, y: slot.y })
    occupied.push({
      x: slot.x,
      y: slot.y,
      width: bounds.width + gap,
      height: bounds.height + gap,
    })
  }

  return slots
}

function getBaseBounds(boundsByGroup: Map<GroupId, WorldRect>): {
  width: number
  height: number
} {
  const widths = [...boundsByGroup.values()]
    .map((bounds) => bounds.width)
    .sort((a, b) => a - b)
  const heights = [...boundsByGroup.values()]
    .map((bounds) => bounds.height)
    .sort((a, b) => a - b)
  const middle = Math.floor(widths.length / 2)

  return {
    width: widths[middle] ?? 1,
    height: heights[middle] ?? 1,
  }
}

function modeSeed(mode: ArrangeLoosePiecesMode): number {
  if (mode === "top") return 101
  if (mode === "right") return 211
  if (mode === "bottom") return 307
  if (mode === "left") return 401
  return 503
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
