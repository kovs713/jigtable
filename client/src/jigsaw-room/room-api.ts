import type {
  CreateJigsawRoomResponse,
  JigsawRoomSnapshot,
} from "@jigtable/jigsaw-core/multiplayer/protocol"

import { API_BASE_URL } from "@/config"

export interface CreateJigsawRoomInput {
  imageUrl: string
  pieceCount: number
  sourceWidth?: number
  sourceHeight?: number
}

export async function createJigsawRoom(
  input: CreateJigsawRoomInput,
  authToken: string
): Promise<CreateJigsawRoomResponse> {
  const response = await fetch(`${API_BASE_URL}/api/rooms`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  })

  return readJsonResponse<CreateJigsawRoomResponse>(response)
}

export async function fetchJigsawRoomSnapshot(
  roomId: string
): Promise<JigsawRoomSnapshot> {
  const response = await fetch(
    `${API_BASE_URL}/api/rooms/${encodeURIComponent(roomId)}`
  )
  const payload = await readJsonResponse<unknown>(response)

  if (!isRecord(payload) || !isRecord(payload.state)) {
    throw new Error("Invalid room snapshot")
  }

  return payload.state as unknown as JigsawRoomSnapshot
}

export async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    if (isRecord(payload) && typeof payload.error === "string") {
      throw new Error(payload.error)
    }

    throw new Error(`Request failed: ${response.status}`)
  }

  return payload as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
