import { describe, expect, test } from "bun:test"

import { DEFAULT_JIGSAW_CONFIG } from "../src/config"
import { createJigsawState } from "../src/generate"
import { snapDroppedGroup } from "../src/snap"

describe("snapDroppedGroup", () => {
  test("captures both groups before a neighbor snap mutates them", () => {
    const state = createJigsawState({
      ...DEFAULT_JIGSAW_CONFIG,
      rows: 1,
      cols: 2,
      originX: 0,
      originY: 0,
      pieceWidth: 100,
      pieceHeight: 100,
    })
    const movingPiece = state.pieces["piece-0-0"]!
    const targetPiece = state.pieces["piece-0-1"]!
    const movingGroupId = movingPiece.groupId
    const targetGroupId = targetPiece.groupId

    movingPiece.x = 50
    movingPiece.y = 50
    targetPiece.x = 151
    targetPiece.y = 50

    const result = snapDroppedGroup(state, movingGroupId)

    expect(result).toMatchObject({
      kind: "neighbor",
      groupId: movingGroupId,
      movingGroupId,
      targetGroupId,
      resultGroupId: movingGroupId,
      movingPieceIds: ["piece-0-0"],
      targetPieceIds: ["piece-0-1"],
      affectedPieceIds: ["piece-0-0", "piece-0-1"],
    })
    expect(state.groups[targetGroupId]).toBeUndefined()
  })

  test("captures the group and pieces for a correct snap", () => {
    const state = createJigsawState({
      ...DEFAULT_JIGSAW_CONFIG,
      rows: 1,
      cols: 1,
      originX: 0,
      originY: 0,
    })
    const piece = state.pieces["piece-0-0"]!
    const groupId = piece.groupId

    piece.x = 3
    piece.y = 4

    expect(snapDroppedGroup(state, groupId)).toEqual({
      kind: "correct",
      groupId,
      pieceIds: ["piece-0-0"],
      affectedPieceIds: ["piece-0-0"],
    })
  })
})
