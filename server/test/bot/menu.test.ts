import { describe, expect, test } from "bun:test"

import type { BotContext, UploadSession } from "@/bot/types"
import { renderUploadKeyboard } from "@/bot/upload/status"
import {
  clearNavigationMessage,
  inlineMenuKeyboard,
  mainMenuKeyboard,
  nextActionsKeyboard,
  replyWithMainMenu,
} from "../../src/bot/menu"

const ctx = {
  t(key: string) {
    return key
  },
  session: {
    activeCompositionId: "composition-1",
  },
} as unknown as BotContext

function uploadSession(): UploadSession {
  return {
    images: [],
    duplicateCount: 0,
    seenFileUniqueIds: [],
  }
}

describe("bot keyboards", () => {
  test("keeps primary navigation persistent", () => {
    const keyboard = mainMenuKeyboard(ctx)

    expect(keyboard.keyboard).toEqual([
      [{ text: "menu-new" }, { text: "menu-list" }],
      [{ text: "menu-help" }],
    ])
    expect(keyboard.is_persistent).toBe(true)
    expect(keyboard.resize_keyboard).toBe(true)
  })

  test("remembers when the main menu has been shown", async () => {
    const replies: unknown[][] = []
    const menuCtx = {
      t(key: string) {
        return key
      },
      session: {},
      async reply(...args: unknown[]) {
        replies.push(args)
        return { message_id: 42 }
      },
    } as unknown as BotContext

    await replyWithMainMenu(menuCtx, "welcome")

    expect(menuCtx.session.mainMenuShown).toBe(true)
    expect(menuCtx.session.navigationMessageId).toBe(42)
    expect(replies).toHaveLength(1)
  })

  test("retries navigation messages that could not be deleted", async () => {
    let shouldFail = true
    const menuCtx = {
      chat: { id: 1 },
      session: { navigationMessageId: 42 },
      api: {
        async deleteMessage() {
          if (shouldFail) throw new Error("network error")
        },
      },
    } as unknown as BotContext

    await clearNavigationMessage(menuCtx)
    expect(menuCtx.session.staleMessageIds).toEqual([42])

    shouldFail = false
    await clearNavigationMessage(menuCtx)
    expect(menuCtx.session.staleMessageIds).toEqual([])
  })

  test("offers next actions after completing a composition", () => {
    expect(nextActionsKeyboard(ctx)).toEqual([
      [
        { text: "menu-new", callback_data: "menu:new" },
        { text: "menu-list", callback_data: "menu:list" },
      ],
    ])
  })

  test("offers full navigation without the Telegram menu", () => {
    expect(inlineMenuKeyboard(ctx)).toEqual([
      [
        { text: "menu-new", callback_data: "menu:new" },
        { text: "menu-list", callback_data: "menu:list" },
      ],
      [{ text: "menu-help", callback_data: "menu:help" }],
    ])
  })

  test("always allows canceling the current upload", () => {
    const keyboard = renderUploadKeyboard(ctx, uploadSession())

    expect(keyboard.at(-1)).toEqual([
      {
        text: "button-cancel-upload",
        callback_data: "upload:cancel:composition-1",
      },
    ])
  })

  test("scopes upload actions to the current composition", () => {
    const session = uploadSession()
    session.images.push({
      id: "image-1",
      fileId: "telegram-file",
      fileUniqueId: "unique-file",
      width: 100,
      height: 100,
      sourceMessageId: 1,
      status: "active",
      createdAt: 1,
    })

    expect(renderUploadKeyboard(ctx, session)[0]).toEqual([
      {
        text: "button-view",
        callback_data: "upload:view:composition-1",
      },
      {
        text: "button-build",
        callback_data: "upload:build:composition-1",
      },
    ])
  })
})
