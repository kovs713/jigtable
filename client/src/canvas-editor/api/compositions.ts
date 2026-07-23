import { apiRoutes } from "@jigtable/shared/api-routes"

import { API_BASE_URL } from "@/config"
import { readJsonResponse } from "@/lib/api-response"

import type {
  CanvasLayout,
  CompositionLayoutResponse,
  CompositionRef,
} from "../model/types"

export async function fetchCompositionLayout(
  composition: CompositionRef,
  authToken: string
): Promise<CompositionLayoutResponse> {
  return requestCompositionLayout(composition, authToken, "GET")
}

export async function updateCompositionLayout(
  composition: CompositionRef,
  authToken: string,
  layout: CanvasLayout
): Promise<CompositionLayoutResponse> {
  return requestCompositionLayout(composition, authToken, "PATCH", { layout })
}

export async function renderComposition(
  composition: CompositionRef,
  authToken: string,
  layout: CanvasLayout
): Promise<{ jigsawImageUrl: string }> {
  const response = await fetch(
    `${API_BASE_URL}${apiRoutes.compositions.post.render.build(composition.compositionId)}?editToken=${encodeURIComponent(composition.token)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ format: "png", layout }),
    }
  )

  return readJsonResponse<{ jigsawImageUrl: string }>(response)
}

async function requestCompositionLayout(
  composition: CompositionRef,
  authToken: string,
  method: "GET" | "PATCH",
  body?: unknown
): Promise<CompositionLayoutResponse> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${authToken}`,
  }

  if (body) headers["Content-Type"] = "application/json"

  const response = await fetch(
    `${API_BASE_URL}${apiRoutes.compositions.get.layout.build(composition.compositionId)}?editToken=${encodeURIComponent(composition.token)}`,
    {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }
  )

  return readJsonResponse<CompositionLayoutResponse>(response)
}
