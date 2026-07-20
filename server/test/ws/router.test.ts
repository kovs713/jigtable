import { describe, expect, test } from "bun:test"

import type { Services } from "@/services"
import type { RoomController } from "@/ws/room-controller"
import { composeWs, createWsRouter } from "@/ws/router"
import type { WsContext, WsSocket } from "@/ws/types"

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

  test("parses and dispatches known text messages", async () => {
    const socket = createSocket()
    let receivedSocket: WsSocket | undefined

    const router = createTestRouter({
      handleRoomRequestState(currentSocket) {
        receivedSocket = currentSocket
      },
    })

    await router.message(socket, '{"type":"room:request_state"}')

    expect(receivedSocket).toBe(socket)
  })

  test("returns a protocol error for unknown messages", async () => {
    const sent: string[] = []
    const router = createTestRouter()
    const socket = createSocket(sent)

    await router.message(socket, '{"type":"unknown:event"}')

    expect(JSON.parse(sent[0] ?? "null")).toEqual({
      type: "error",
      code: "unknown_message",
      message: "Unknown message type",
    })
  })

  test("returns a protocol error for invalid JSON", async () => {
    const sent: string[] = []
    const router = createTestRouter()
    const socket = createSocket(sent)

    await router.message(socket, "{")

    expect(JSON.parse(sent[0] ?? "null")).toEqual({
      type: "error",
      code: "invalid_json",
      message: "Invalid JSON",
    })
  })

  test("rejects binary messages", async () => {
    const sent: string[] = []
    const router = createTestRouter()
    const socket = createSocket(sent)

    await router.message(socket, Buffer.from('{"type":"room:request_state"}'))

    expect(JSON.parse(sent[0] ?? "null")).toEqual({
      type: "error",
      code: "invalid_message",
      message: "Message must be string",
    })
  })

  test("opens and closes room connection lifecycle", async () => {
    const calls: string[] = []
    const socket = createSocket()

    const router = createTestRouter({
      open(currentSocket) {
        expect(currentSocket).toBe(socket)
        calls.push("open")
      },

      async handleClose(currentSocket) {
        expect(currentSocket).toBe(socket)
        calls.push("close")
      },
    })

    router.open(socket)
    await router.close(socket)

    expect(calls).toEqual(["open", "close"])
  })
})

function createTestRouter(
  overrides: Partial<RoomController> = {}
): ReturnType<typeof createWsRouter> {
  const roomController = {
    open() {},
    async handleClose() {},
    ...overrides,
  } as unknown as RoomController

  return createWsRouter({
    services: {} as Services,
    roomController,
  })
}

function createSocket(sent: string[] = []): WsSocket {
  return {
    data: {
      connectionId: "connection_1",
    },

    send(message: string | ArrayBufferView | ArrayBuffer | SharedArrayBuffer) {
      const body = String(message)

      sent.push(body)

      return Buffer.byteLength(body)
    },
  } as WsSocket
}
