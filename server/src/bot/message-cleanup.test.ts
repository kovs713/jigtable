import { describe, expect, test } from "bun:test"

import type { BotContext } from "@/bot/types"
import { isTransientTextAction } from "./message-cleanup"

function context(text: string, commandLength?: number): BotContext {
  return {
    t(key: string) {
      return key
    },
    message: {
      text,
      entities: commandLength
        ? [{ type: "bot_command", offset: 0, length: commandLength }]
        : undefined,
    },
  } as unknown as BotContext
}

describe("bot message cleanup", () => {
  test("removes reply keyboard actions", () => {
    expect(isTransientTextAction(context("menu-new"))).toBe(true)
    expect(isTransientTextAction(context("menu-list"))).toBe(true)
    expect(isTransientTextAction(context("menu-help"))).toBe(true)
  })

  test("removes supported slash commands", () => {
    expect(isTransientTextAction(context("/start", 6))).toBe(true)
    expect(isTransientTextAction(context("/new@jigtable_bot", 17))).toBe(true)
  })

  test("keeps regular and unknown messages", () => {
    expect(isTransientTextAction(context("hello"))).toBe(false)
    expect(isTransientTextAction(context("/unknown", 8))).toBe(false)
  })
})
