import type { JigsawConfig } from "@jigtable/core/types"
import { apiRoutes } from "@jigtable/shared/api-routes"
import { isRecord } from "@jigtable/shared/utils"

import { API_BASE_URL } from "@/config"
import { readJsonResponse } from "@/lib/api-response"

export interface JigsawHistoryItem {
  roomId: string
  completedAt: string
  elapsedMs: number
  pieceCount: number
  snapCount: number
  imageUrl: string | null
  jigsawConfig: JigsawConfig | null
  source: {
    kind: "dev" | "jigsaw_image" | "external"
    label: string
  }
  participants: Array<{
    playerId?: string
    userId?: string
    telegramId?: string
    name: string
    color: string
  }>
}

export async function fetchJigsawHistory(
  token: string
): Promise<JigsawHistoryItem[]> {
  const response = await fetch(
    `${API_BASE_URL}${apiRoutes.auth.get.history.pattern}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  )
  const payload = await readJsonResponse<unknown>(response)

  if (!isRecord(payload) || !Array.isArray(payload.history)) {
    throw new Error("Invalid history response")
  }

  return payload.history as JigsawHistoryItem[]
}
