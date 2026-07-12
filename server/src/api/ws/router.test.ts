import { describe, expect, test } from "bun:test"

import type { Services } from "@/services"
import { composeWs, createWsRouter } from "./router"
import type { WsContext, WsSocket } from "./types"

describe("WebSocket router", () => {
  test("runs middleware and handler in order", async () => {
    const calls: string[] = []
    const pipeline = composeWs(
      [
        async (_context, next) => {
          calls.push("before")
          await next()
          calls.push("after")
        },
      ],
      async () => {
        await Promise.resolve()
        calls.push("handler")
      }
    )

    await pipeline({} as WsContext)

    expect(calls).toEqual(["before", "handler", "after"])
  })

  test("rejects duplicate event registrations", () => {
    const router = createWsRouter({ services: {} as Services })
    const config = { handler: () => undefined }

    router.on("room:join", config)

    expect(() => router.on("room:join", config)).toThrow(
      "Duplicate WebSocket route: room:join"
    )
  })

  test("parses and dispatches text messages", async () => {
    const router = createWsRouter({ services: {} as Services })
    const socket = createSocket()
    let received: unknown

    router.on("test:event", {
      handler: ({ message }) => {
        received = message
      },
    })

    await router.message(socket, '{"type":"test:event","value":1}')

    expect(received).toEqual({ type: "test:event", value: 1 })
  })

  test("returns a protocol error for invalid JSON", async () => {
    const sent: string[] = []
    const router = createWsRouter({ services: {} as Services })
    const socket = createSocket(sent)

    await router.message(socket, "{")

    expect(JSON.parse(sent[0] ?? "null")).toEqual({
      type: "error",
      code: "invalid_json",
      message: "Invalid JSON",
    })
  })
})

function createSocket(sent: string[] = []): WsSocket {
  return {
    data: { connectionId: "connection_1" },
    send(message: string | ArrayBufferView | ArrayBuffer | SharedArrayBuffer) {
      sent.push(String(message))
      return Buffer.byteLength(String(message))
    },
  } as WsSocket
}
