import type { JigsawConfig } from "@jigtable/core"
import type {
  CreateJigsawRoomResponse,
  RoomSnapshot as JigsawRoomSnapshot,
} from "@jigtable/core/protocol"
import { isRecord } from "@jigtable/shared/utils"

import { API_BASE_URL } from "@/config"

export interface CreateJigsawRoomInput {
  imageUrl: string
  pieceCount: number
  sourceWidth?: number
  sourceHeight?: number
}

export interface UserCompositionItem {
  compositionId: string
  compositionToken: string
  status: string
  createdAt: string | null
  imageCount: number
  canvas: { width: number; height: number } | null
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

export async function createJigsawRoomFromComposition(
  compositionId: string,
  compositionToken: string,
  pieceCount: number,
  authToken: string
): Promise<CreateJigsawRoomResponse> {
  const response = await fetch(`${API_BASE_URL}/api/rooms`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ compositionId, compositionToken, pieceCount }),
  })

  return readJsonResponse<CreateJigsawRoomResponse>(response)
}

export async function fetchUserCompositions(
  authToken: string
): Promise<UserCompositionItem[]> {
  const response = await fetch(`${API_BASE_URL}/api/me/compositions`, {
    headers: { Authorization: `Bearer ${authToken}` },
  })
  const payload = await readJsonResponse<unknown>(response)

  if (!isRecord(payload) || !Array.isArray(payload.compositions)) {
    throw new Error("Invalid compositions response")
  }

  return payload.compositions as UserCompositionItem[]
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

export interface JigsawRoomResult {
  roomId: string
  imageUrl: string | null
  jigsawConfig: JigsawConfig | null
  elapsedMs: number
  pieceCount: number
  snapCount: number
  completedAt: string
  participants: Array<{
    userId?: string
    telegramId?: string
    name: string
    color: string
  }>
}

export async function fetchJigsawRoomResult(
  roomId: string
): Promise<JigsawRoomResult> {
  const response = await fetch(
    `${API_BASE_URL}/api/rooms/${encodeURIComponent(roomId)}/result`
  )
  const payload = await readJsonResponse<unknown>(response)

  if (!isRecord(payload) || !isRecord(payload.result)) {
    throw new Error("Invalid room result")
  }

  return payload.result as unknown as JigsawRoomResult
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
