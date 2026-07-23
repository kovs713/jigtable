import { apiRoutes } from "@jigtable/shared/api-routes"
import { isRecord } from "@jigtable/shared/utils"

import { API_BASE_URL } from "@/config"
import { readJsonResponse } from "@/lib/api-response"

export interface UserCompositionItem {
  compositionId: string
  compositionToken: string
  status: string
  createdAt: string | null
  imageCount: number
  canvas: { width: number; height: number } | null
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
