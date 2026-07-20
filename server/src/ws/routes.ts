import { isRecord } from "@jigtable/shared/utils"

import {
  parseArrangeGroupsInput,
  parseChatSendInput,
  parseCommandInput,
  parseCursorMoveInput,
  parseGroupDropInput,
  parseGroupIdInput,
  parseGroupMoveInput,
  parseLockToggleInput,
  parsePingInput,
  parseRoomJoinInput,
} from "./inputs"
import { sendWsError } from "./send"
import type { WsContext } from "./types"

export async function routeWsMessage(context: WsContext): Promise<void> {
  const { socket, roomController, message } = context

  if (!isRecord(message) || typeof message.type !== "string") {
    sendWsError(socket, "invalid_message", "Message type is required")
    return
  }

  switch (message.type) {
    case "room:join": {
      const input = parseRoomJoinInput(message)

      if (!input) {
        sendWsError(socket, "invalid_message", "Invalid room join message")
        return
      }

      await roomController.handleRoomJoin(socket, input)
      return
    }

    case "room:request_state": {
      roomController.handleRoomRequestState(socket)
      return
    }

    case "session:pause": {
      await roomController.handleSessionPause(socket)
      return
    }

    case "session:resume": {
      await roomController.handleSessionResume(socket)
      return
    }

    case "group:grab": {
      const input = parseGroupIdInput(message)

      if (!input) {
        sendWsError(socket, "invalid_message", "Invalid group grab message")
        return
      }

      await roomController.handleGroupGrab(socket, input)
      return
    }

    case "group:move": {
      const input = parseGroupMoveInput(message)

      if (!input) {
        sendWsError(socket, "invalid_message", "Invalid group move message")
        return
      }

      await roomController.handleGroupMove(socket, input)
      return
    }

    case "group:drop": {
      const input = parseGroupDropInput(message)

      if (!input) {
        sendWsError(socket, "invalid_message", "Invalid group drop message")
        return
      }

      await roomController.handleGroupDrop(socket, input)
      return
    }

    case "room:preview:open":
    case "room:preview:close": {
      const input = parseCommandInput(message)

      if (!input) {
        sendWsError(socket, "invalid_message", "Invalid preview message")
        return
      }

      await roomController.handlePreviewToggle(
        socket,
        message.type === "room:preview:open",
        input
      )
      return
    }

    case "group:release": {
      const input = parseGroupIdInput(message)

      if (!input) {
        sendWsError(socket, "invalid_message", "Invalid group release message")
        return
      }

      await roomController.handleGroupRelease(socket, input)
      return
    }

    case "groups:arrange": {
      const input = parseArrangeGroupsInput(message)

      if (!input) {
        sendWsError(socket, "invalid_message", "Invalid arrange message")
        return
      }

      await roomController.handleGroupsArrange(socket, input)
      return
    }

    case "room:lock-toggle": {
      const input = parseLockToggleInput(message)

      if (!input) {
        sendWsError(socket, "invalid_message", "Invalid lock toggle message")
        return
      }

      await roomController.handleRoomLockToggle(socket, input)
      return
    }

    case "room:ping": {
      const input = parsePingInput(message)

      if (!input) {
        sendWsError(socket, "invalid_message", "Invalid ping message")
        return
      }

      await roomController.handleRoomPing(socket, input)
      return
    }

    case "cursor:move": {
      const input = parseCursorMoveInput(message)

      if (!input) {
        sendWsError(socket, "invalid_message", "Invalid cursor move message")
        return
      }

      roomController.handleCursorMove(socket, input)
      return
    }

    case "cursor:hide": {
      roomController.handleCursorHide(socket)
      return
    }

    case "chat:send": {
      const input = parseChatSendInput(message)

      if (!input) {
        sendWsError(socket, "invalid_message", "Invalid chat message")
        return
      }

      roomController.handleChatSend(socket, input)
      return
    }

    default: {
      sendWsError(socket, "unknown_message", "Unknown message type")
    }
  }
}
