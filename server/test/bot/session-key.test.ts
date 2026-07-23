import { describe, expect, test } from "bun:test"
import type { Context } from "grammy"

import { getBotSessionKey } from "@/bot/session-key"

describe("bot session identity", () => {
  test("keeps the existing private-chat session key", () => {
    const ctx = { chat: { id: 42, type: "private" } } as Context

    expect(getBotSessionKey(ctx)).toBe("42")
  })

  test("shares one session across group members", () => {
    const firstMember = {
      chat: { id: -100, type: "supergroup" },
      from: { id: 1 },
    } as Context
    const secondMember = {
      chat: { id: -100, type: "supergroup" },
      from: { id: 2 },
    } as Context

    expect(getBotSessionKey(firstMember)).toBe("-100")
    expect(getBotSessionKey(secondMember)).toBe("-100")
  })
})
