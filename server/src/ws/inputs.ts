import {
  CHAT_MESSAGE_MAX_LENGTH,
  type ClientToServerMessage,
} from "@jigtable/core/protocol"
import type { ArrangeLoosePiecesMode } from "@jigtable/core/scatter"
import { string } from "@jigtable/shared/schemas"
import { isRecord } from "@jigtable/shared/utils"

type InputFor<Type extends ClientToServerMessage["type"]> = Omit<
  Extract<ClientToServerMessage, { type: Type }>,
  "type"
>

const arrangeModes = new Set<ArrangeLoosePiecesMode>([
  "perimeter",
  "top",
  "right",
  "bottom",
  "left",
])

export function parseRoomJoinInput(
  message: unknown
): InputFor<"room:join"> | null {
  if (!isRecord(message)) return null

  const roomId = string().parse(message.roomId)
  const sessionToken = string().parse(message.sessionToken)

  return roomId.ok && sessionToken.ok
    ? { roomId: roomId.value, sessionToken: sessionToken.value }
    : null
}

export function parseGroupIdInput(
  message: unknown
): InputFor<"group:grab"> | null {
  if (!isRecord(message)) return null

  const groupId = string().parse(message.groupId)

  return groupId.ok ? { groupId: groupId.value } : null
}

export function parseGroupMoveInput(
  message: unknown
): InputFor<"group:move"> | null {
  if (!isRecord(message)) return null

  const groupId = string().parse(message.groupId)
  const x = readCoordinate(message.x)
  const y = readCoordinate(message.y)

  return groupId.ok && x !== null && y !== null
    ? { groupId: groupId.value, x, y }
    : null
}

export function parseGroupDropInput(
  message: unknown
): InputFor<"group:drop"> | null {
  const move = parseGroupMoveInput(message)

  if (!move || !isRecord(message)) return null

  const commandId = readCommandId(message.commandId)

  return commandId ? { ...move, commandId } : null
}

export function parseCommandInput(
  message: unknown
): InputFor<"room:preview:open"> | null {
  if (!isRecord(message)) return null

  const commandId = readCommandId(message.commandId)

  return commandId ? { commandId } : null
}

export function parseArrangeGroupsInput(
  message: unknown
): InputFor<"groups:arrange"> | null {
  if (!isRecord(message) || !isArrangeMode(message.mode)) return null

  return { mode: message.mode }
}

export function parseLockToggleInput(
  message: unknown
): InputFor<"room:lock-toggle"> | null {
  if (!isRecord(message)) return null

  const targetId = string().parse(message.targetId)
  const commandId = readCommandId(message.commandId)

  if (
    !targetId.ok ||
    !commandId ||
    (message.targetType !== "piece" && message.targetType !== "group")
  ) {
    return null
  }

  return {
    targetType: message.targetType,
    targetId: targetId.value,
    commandId,
  }
}

export function parsePingInput(message: unknown): InputFor<"room:ping"> | null {
  if (!isRecord(message)) return null

  const id = string().parse(message.id)
  const commandId = readCommandId(message.commandId)
  const x = readCoordinate(message.x)
  const y = readCoordinate(message.y)

  return id.ok && commandId && x !== null && y !== null
    ? { commandId, id: id.value, x, y }
    : null
}

export function parseCursorMoveInput(
  message: unknown
): InputFor<"cursor:move"> | null {
  if (!isRecord(message)) return null

  const x = readCoordinate(message.x)
  const y = readCoordinate(message.y)

  return x !== null && y !== null ? { x, y } : null
}

export function parseChatSendInput(
  message: unknown
): InputFor<"chat:send"> | null {
  if (!isRecord(message) || typeof message.text !== "string") return null

  const text = message.text.trim()

  if (!text || text.length > CHAT_MESSAGE_MAX_LENGTH) return null

  if (message.x === undefined && message.y === undefined) return { text }

  const x = readCoordinate(message.x)
  const y = readCoordinate(message.y)

  return x !== null && y !== null ? { text, x, y } : null
}

function isArrangeMode(value: unknown): value is ArrangeLoosePiecesMode {
  return (
    typeof value === "string" &&
    arrangeModes.has(value as ArrangeLoosePiecesMode)
  )
}

function readCoordinate(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function readCommandId(value: unknown): string | null {
  if (typeof value !== "string") return null

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
    ? value
    : null
}
