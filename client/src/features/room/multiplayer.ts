import type {
  ClientToServerMessage,
  ServerToClientMessage,
} from "@jigtable/core/protocol"

import { API_BASE_URL, JIGSAW_WS_ENABLED, JIGSAW_WS_URL } from "@/config"

export type MultiplayerStatus =
  "disabled" | "connecting" | "connected" | "disconnected" | "unavailable"

export interface JigsawMultiplayerClient {
  send: (message: ClientToServerMessage) => void
  requestState: () => void
  isConnected: () => boolean
  destroy: () => void
}

export function createJigsawMultiplayerClient({
  roomId,
  sessionToken,
  onMessage,
  onStatus,
}: {
  roomId: string
  sessionToken: string
  onMessage: (message: ServerToClientMessage) => void
  onStatus: (status: MultiplayerStatus) => void
}): JigsawMultiplayerClient {
  const url = getJigsawWebSocketUrl()

  if (!url) {
    onStatus("disabled")

    return createDisabledClient()
  }

  let socket: WebSocket | null = new WebSocket(url)
  let connected = false

  onStatus("connecting")

  socket.addEventListener("open", () => {
    connected = true
    onStatus("connected")
    send({ type: "room:join", roomId, sessionToken })
  })

  socket.addEventListener("message", (event) => {
    const message = parseServerMessage(event.data)

    if (message) {
      onMessage(message)
    }
  })

  socket.addEventListener("error", () => {
    if (!connected) {
      onStatus("unavailable")
    }
  })

  socket.addEventListener("close", () => {
    const wasConnected = connected
    connected = false
    socket = null
    onStatus(wasConnected ? "disconnected" : "unavailable")
  })

  function send(message: ClientToServerMessage): void {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return
    }

    socket.send(JSON.stringify(message))
  }

  return {
    send,
    requestState() {
      send({ type: "room:request_state" })
    },
    isConnected() {
      return connected
    },
    destroy() {
      connected = false
      socket?.close()
      socket = null
    },
  }
}

function createDisabledClient(): JigsawMultiplayerClient {
  return {
    send() {},
    requestState() {},
    isConnected() {
      return false
    },
    destroy() {},
  }
}

function getJigsawWebSocketUrl(): string | null {
  if (!JIGSAW_WS_ENABLED) {
    return null
  }

  if (JIGSAW_WS_URL) {
    return JIGSAW_WS_URL
  }

  const parsed = new URL(API_BASE_URL, window.location.href)
  parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:"
  parsed.pathname = "/api/jigsaw/ws"
  parsed.search = ""

  return parsed.toString()
}

function parseServerMessage(raw: unknown): ServerToClientMessage | null {
  if (typeof raw !== "string") {
    return null
  }

  try {
    return JSON.parse(raw) as ServerToClientMessage
  } catch {
    return null
  }
}
