import type { JigsawConfig } from "@jigtable/core"
import type { SessionSummary } from "@jigtable/core/session-history"
import type {
  CreateJigsawRoomResponse,
  RoomSnapshot as JigsawRoomSnapshot,
} from "@jigtable/core/protocol"
import { apiRoutes } from "@jigtable/shared/api-routes"
import { isRecord } from "@jigtable/shared/utils"

import { API_BASE_URL } from "@/config"
import { readJsonResponse } from "@/lib/api-response"

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
  const response = await fetch(
    `${API_BASE_URL}${apiRoutes.rooms.post.pattern}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    }
  )

  return readJsonResponse<CreateJigsawRoomResponse>(response)
}

export async function createJigsawRoomFromComposition(
  compositionId: string,
  compositionToken: string,
  pieceCount: number,
  authToken: string
): Promise<CreateJigsawRoomResponse> {
  const response = await fetch(
    `${API_BASE_URL}${apiRoutes.rooms.post.pattern}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ compositionId, compositionToken, pieceCount }),
    }
  )

  return readJsonResponse<CreateJigsawRoomResponse>(response)
}

export async function fetchUserCompositions(
  authToken: string
): Promise<UserCompositionItem[]> {
  const response = await fetch(
    `${API_BASE_URL}${apiRoutes.compositions.get.me.pattern}`,
    {
      headers: { Authorization: `Bearer ${authToken}` },
    }
  )
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
    `${API_BASE_URL}${apiRoutes.rooms.get.byRoomId.build(roomId)}`
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
  summary: SessionSummary | null
}

export async function fetchJigsawRoomResult(
  roomId: string
): Promise<JigsawRoomResult> {
  const response = await fetch(
    `${API_BASE_URL}${apiRoutes.rooms.get.result.byRoomId.build(roomId)}`
  )
  const payload = await readJsonResponse<unknown>(response)

  if (!isRecord(payload) || !isRecord(payload.result)) {
    throw new Error("Invalid room result")
  }

  return payload.result as unknown as JigsawRoomResult
}
