import { describe, expect, test } from "bun:test"

import { clampPieceCount } from "./room-factory"

describe("clampPieceCount", () => {
  test("keeps piece counts within limits", () => {
    expect(clampPieceCount(4)).toBe(4)
    expect(clampPieceCount(2_000)).toBe(2_000)
  })

  test("clamps values outside limits", () => {
    expect(clampPieceCount(1)).toBe(4)
    expect(clampPieceCount(2_001)).toBe(2_000)
  })
})
