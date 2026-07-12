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
    handler: async ({ socket, services, message }) => {
      const input = parseRoomJoinInput(message)

      if (!input) {
        sendWsError(socket, "invalid_message", "Invalid room join message")
        return
      }

      await services.rooms.handleRoomJoin(socket, input)
    },
  })

  ws.on("room:request_state", {
    handler: ({ socket, services }) => {
      services.rooms.handleRoomRequestState(socket)
    },
  })

  ws.on("session:pause", {
    handler: ({ socket, services }) => {
      services.rooms.handleSessionPause(socket)
    },
  })

  ws.on("session:resume", {
    handler: ({ socket, services }) => {
      services.rooms.handleSessionResume(socket)
    },
  })

  ws.on("group:grab", {
    handler: ({ socket, services, message }) => {
      const input = parseGroupIdInput(message)

      if (!input) {
        sendWsError(socket, "invalid_message", "Invalid group grab message")
        return
      }

      services.rooms.handleGroupGrab(socket, input)
    },
  })

  ws.on("group:move", {
    handler: ({ socket, services, message }) => {
      const input = parseGroupMoveInput(message)

      if (!input) {
        sendWsError(socket, "invalid_message", "Invalid group move message")
        return
      }

      services.rooms.handleGroupMove(socket, input)
    },
  })

  ws.on("group:drop", {
    handler: ({ socket, services, message }) => {
      const input = parseGroupMoveInput(message)

      if (!input) {
        sendWsError(socket, "invalid_message", "Invalid group drop message")
        return
      }

      services.rooms.handleGroupDrop(socket, input)
    },
  })

  ws.on("group:release", {
    handler: ({ socket, services, message }) => {
      const input = parseGroupIdInput(message)

      if (!input) {
        sendWsError(socket, "invalid_message", "Invalid group release message")
        return
      }

      services.rooms.handleGroupRelease(socket, input)
    },
  })

  ws.on("groups:arrange", {
    handler: ({ socket, services, message }) => {
      const input = parseArrangeGroupsInput(message)

      if (!input) {
        sendWsError(socket, "invalid_message", "Invalid arrange message")
        return
      }

      services.rooms.handleGroupsArrange(socket, input)
    },
  })

  ws.on("room:lock-toggle", {
    handler: ({ socket, services, message }) => {
      const input = parseLockToggleInput(message)

      if (!input) {
        sendWsError(socket, "invalid_message", "Invalid lock toggle message")
        return
      }

      services.rooms.handleRoomLockToggle(socket, input)
    },
  })

  ws.on("room:ping", {
    handler: ({ socket, services, message }) => {
      const input = parsePingInput(message)

      if (!input) {
        sendWsError(socket, "invalid_message", "Invalid ping message")
        return
      }

      services.rooms.handleRoomPing(socket, input)
    },
  })

  ws.on("cursor:move", {
    handler: ({ socket, services, message }) => {
      const input = parseCursorMoveInput(message)

      if (!input) {
        sendWsError(socket, "invalid_message", "Invalid cursor move message")
        return
      }

      services.rooms.handleCursorMove(socket, input)
    },
  })

  ws.on("cursor:hide", {
    handler: ({ socket, services }) => {
      services.rooms.handleCursorHide(socket)
    },
  })
}
