import type { ClientToServerMessage } from "@jigtable/core/protocol"
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

  if (
    !targetId.ok ||
    (message.targetType !== "piece" && message.targetType !== "group")
  ) {
    return null
  }

  return {
    targetType: message.targetType,
    targetId: targetId.value,
  }
}

export function parsePingInput(message: unknown): InputFor<"room:ping"> | null {
  if (!isRecord(message)) return null

  const id = string().parse(message.id)
  const x = readCoordinate(message.x)
  const y = readCoordinate(message.y)

  return id.ok && x !== null && y !== null ? { id: id.value, x, y } : null
}

export function parseCursorMoveInput(
  message: unknown
): InputFor<"cursor:move"> | null {
  if (!isRecord(message)) return null

  const x = readCoordinate(message.x)
  const y = readCoordinate(message.y)

  return x !== null && y !== null ? { x, y } : null
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
