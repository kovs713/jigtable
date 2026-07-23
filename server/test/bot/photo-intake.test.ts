import { describe, expect, test } from "bun:test"

import type { BotContext } from "@/bot/types"
import { clearStatusPanel, refreshPhotoReplyPrompt } from "@/bot/upload/status"

describe("group photo intake", () => {
  test("prompts group members to reply with photos", async () => {
    const sentMessages: unknown[][] = []
    const ctx = {
      chat: { id: -100, type: "supergroup" },
      session: {
        upload: {
          images: [],
          duplicateCount: 0,
          seenFileUniqueIds: [],
        },
      },
      t(key: string) {
        return key
      },
      api: {
        async sendMessage(...args: unknown[]) {
          sentMessages.push(args)
          return { message_id: 42 }
        },
      },
    } as unknown as BotContext

    await refreshPhotoReplyPrompt(ctx, -100)

    expect(sentMessages).toEqual([
      [
        -100,
        "group-photo-prompt",
        {
          reply_markup: {
            force_reply: true,
            input_field_placeholder: "group-photo-placeholder",
          },
        },
      ],
    ])
    expect(ctx.session.upload?.photoPromptMessageId).toBe(42)
  })

  test("replaces the previous reply prompt", async () => {
    const actions: string[] = []
    const ctx = {
      chat: { id: -101, type: "group" },
      session: {
        upload: {
          images: [],
          duplicateCount: 0,
          seenFileUniqueIds: [],
          photoPromptMessageId: 41,
        },
      },
      t(key: string) {
        return key
      },
      api: {
        async deleteMessage(chatId: number, messageId: number) {
          actions.push(`delete:${chatId}:${messageId}`)
        },
        async sendMessage() {
          actions.push("send")
          return { message_id: 42 }
        },
      },
    } as unknown as BotContext

    await refreshPhotoReplyPrompt(ctx, -101)

    expect(actions).toEqual(["delete:-101:41", "send"])
    expect(ctx.session.upload?.photoPromptMessageId).toBe(42)
  })

  test("leaves private-chat photo intake unchanged", async () => {
    let sent = false
    const ctx = {
      chat: { id: 42, type: "private" },
      session: {
        upload: {
          images: [],
          duplicateCount: 0,
          seenFileUniqueIds: [],
        },
      },
      api: {
        async sendMessage() {
          sent = true
          return { message_id: 42 }
        },
      },
    } as unknown as BotContext

    await refreshPhotoReplyPrompt(ctx, 42)

    expect(sent).toBe(false)
  })

  test("removes a prompt that finishes sending after upload cleanup", async () => {
    const sendStarted = Promise.withResolvers<void>()
    const releaseSend = Promise.withResolvers<void>()
    const deletedMessageIds: number[] = []
    const ctx = {
      chat: { id: -102, type: "supergroup" },
      session: {
        upload: {
          images: [],
          duplicateCount: 0,
          seenFileUniqueIds: [],
        },
      },
      t(key: string) {
        return key
      },
      api: {
        async deleteMessage(_chatId: number, messageId: number) {
          deletedMessageIds.push(messageId)
        },
        async sendMessage() {
          sendStarted.resolve()
          await releaseSend.promise
          return { message_id: 42 }
        },
      },
    } as unknown as BotContext

    const refresh = refreshPhotoReplyPrompt(ctx, -102)
    await sendStarted.promise
    await clearStatusPanel(ctx, -102)
    releaseSend.resolve()
    await refresh

    expect(deletedMessageIds).toEqual([42])
    expect(ctx.session.upload?.photoPromptMessageId).toBeUndefined()
  })

  test("keeps only the newest overlapping prompt refresh", async () => {
    const firstSendStarted = Promise.withResolvers<void>()
    const secondSendStarted = Promise.withResolvers<void>()
    const releaseFirstSend = Promise.withResolvers<void>()
    const releaseSecondSend = Promise.withResolvers<void>()
    const deletedMessageIds: number[] = []
    let sendCount = 0
    const ctx = {
      chat: { id: -103, type: "group" },
      session: {
        upload: {
          images: [],
          duplicateCount: 0,
          seenFileUniqueIds: [],
        },
      },
      t(key: string) {
        return key
      },
      api: {
        async deleteMessage(_chatId: number, messageId: number) {
          deletedMessageIds.push(messageId)
        },
        async sendMessage() {
          sendCount++
          if (sendCount === 1) {
            firstSendStarted.resolve()
            await releaseFirstSend.promise
            return { message_id: 41 }
          }

          secondSendStarted.resolve()
          await releaseSecondSend.promise
          return { message_id: 42 }
        },
      },
    } as unknown as BotContext

    const firstRefresh = refreshPhotoReplyPrompt(ctx, -103)
    await firstSendStarted.promise
    const secondRefresh = refreshPhotoReplyPrompt(ctx, -103)
    await secondSendStarted.promise

    releaseFirstSend.resolve()
    await firstRefresh
    releaseSecondSend.resolve()
    await secondRefresh

    expect(deletedMessageIds).toEqual([41])
    expect(ctx.session.upload?.photoPromptMessageId).toBe(42)
  })
})
