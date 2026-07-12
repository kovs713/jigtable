import { describe, expect, test } from "bun:test"

import {
  parseArrangeGroupsInput,
  parseCursorMoveInput,
  parseGroupMoveInput,
} from "./inputs"

describe("WebSocket inputs", () => {
  test("accepts every canonical arrange mode", () => {
    const modes = ["perimeter", "top", "right", "bottom", "left"] as const

    for (const mode of modes) {
      expect(parseArrangeGroupsInput({ mode })).toEqual({ mode })
    }
  })

  test("rejects non-protocol arrange modes", () => {
    expect(parseArrangeGroupsInput({ mode: "grid" })).toBeNull()
    expect(parseArrangeGroupsInput({ mode: "scatter" })).toBeNull()
  })

  test("preserves finite movement coordinates", () => {
    expect(
      parseGroupMoveInput({ groupId: "group_1", x: 10.25, y: -3.75 })
    ).toEqual({ groupId: "group_1", x: 10.25, y: -3.75 })
    expect(parseCursorMoveInput({ x: 0.125, y: 99.875 })).toEqual({
      x: 0.125,
      y: 99.875,
    })
  })

  test("rejects non-finite movement coordinates", () => {
    expect(parseCursorMoveInput({ x: Number.NaN, y: 0 })).toBeNull()
    expect(
      parseCursorMoveInput({ x: 0, y: Number.POSITIVE_INFINITY })
    ).toBeNull()
  })
})
