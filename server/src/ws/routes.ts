import type { WsRouter } from "./router"
import {
  parseArrangeGroupsInput,
  parseCursorMoveInput,
  parseGroupIdInput,
  parseGroupMoveInput,
  parseLockToggleInput,
  parsePingInput,
  parseRoomJoinInput,
} from "./inputs"
import { sendWsError } from "./send"

export function registerWsRoutes(ws: WsRouter): void {
  ws.on("room:join", {
    handler: async ({ socket, roomController, message }) => {
      const input = parseRoomJoinInput(message)

      if (!input) {
        sendWsError(socket, "invalid_message", "Invalid room join message")
        return
      }

      await roomController.handleRoomJoin(socket, input)
    },
  })

  ws.on("room:request_state", {
    handler: ({ socket, roomController }) => {
      roomController.handleRoomRequestState(socket)
    },
  })

  ws.on("session:pause", {
    handler: async ({ socket, roomController }) => {
      await roomController.handleSessionPause(socket)
    },
  })

  ws.on("session:resume", {
    handler: async ({ socket, roomController }) => {
      await roomController.handleSessionResume(socket)
    },
  })

  ws.on("group:grab", {
    handler: async ({ socket, roomController, message }) => {
      const input = parseGroupIdInput(message)

      if (!input) {
        sendWsError(socket, "invalid_message", "Invalid group grab message")
        return
      }

      await roomController.handleGroupGrab(socket, input)
    },
  })

  ws.on("group:move", {
    handler: async ({ socket, roomController, message }) => {
      const input = parseGroupMoveInput(message)

      if (!input) {
        sendWsError(socket, "invalid_message", "Invalid group move message")
        return
      }

      await roomController.handleGroupMove(socket, input)
    },
  })

  ws.on("group:drop", {
    handler: async ({ socket, roomController, message }) => {
      const input = parseGroupMoveInput(message)

      if (!input) {
        sendWsError(socket, "invalid_message", "Invalid group drop message")
        return
      }

      await roomController.handleGroupDrop(socket, input)
    },
  })

  ws.on("group:release", {
    handler: async ({ socket, roomController, message }) => {
      const input = parseGroupIdInput(message)

      if (!input) {
        sendWsError(socket, "invalid_message", "Invalid group release message")
        return
      }

      await roomController.handleGroupRelease(socket, input)
    },
  })

  ws.on("groups:arrange", {
    handler: async ({ socket, roomController, message }) => {
      const input = parseArrangeGroupsInput(message)

      if (!input) {
        sendWsError(socket, "invalid_message", "Invalid arrange message")
        return
      }

      await roomController.handleGroupsArrange(socket, input)
    },
  })

  ws.on("room:lock-toggle", {
    handler: async ({ socket, roomController, message }) => {
      const input = parseLockToggleInput(message)

      if (!input) {
        sendWsError(socket, "invalid_message", "Invalid lock toggle message")
        return
      }

      await roomController.handleRoomLockToggle(socket, input)
    },
  })

  ws.on("room:ping", {
    handler: ({ socket, roomController, message }) => {
      const input = parsePingInput(message)

      if (!input) {
        sendWsError(socket, "invalid_message", "Invalid ping message")
        return
      }

      roomController.handleRoomPing(socket, input)
    },
  })

  ws.on("cursor:move", {
    handler: ({ socket, roomController, message }) => {
      const input = parseCursorMoveInput(message)

      if (!input) {
        sendWsError(socket, "invalid_message", "Invalid cursor move message")
        return
      }

      roomController.handleCursorMove(socket, input)
    },
  })

  ws.on("cursor:hide", {
    handler: ({ socket, roomController }) => {
      roomController.handleCursorHide(socket)
    },
  })
}
