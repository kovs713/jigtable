import { describe, expect, test } from "bun:test"

import {
  parseArrangeGroupsInput,
  parseChatSendInput,
  parseCursorMoveInput,
  parseGroupDropInput,
  parseGroupMoveInput,
} from "@/ws/inputs"

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

  test("requires a UUID command id for persisted commands", () => {
    const input = {
      commandId: "00000000-0000-4000-8000-000000000001",
      groupId: "group-1",
      x: 1,
      y: 2,
    }

    expect(parseGroupDropInput(input)).toEqual(input)
    expect(
      parseGroupDropInput({ ...input, commandId: "not-a-uuid" })
    ).toBeNull()
  })

  test("normalizes and limits chat messages", () => {
    expect(parseChatSendInput({ text: "  hello room  " })).toEqual({
      text: "hello room",
    })
    expect(parseChatSendInput({ text: "here", x: 10, y: -5 })).toEqual({
      text: "here",
      x: 10,
      y: -5,
    })
    expect(parseChatSendInput({ text: "missing coordinate", x: 10 })).toBeNull()
    expect(parseChatSendInput({ text: "   " })).toBeNull()
    expect(parseChatSendInput({ text: "x".repeat(301) })).toBeNull()
  })
})
