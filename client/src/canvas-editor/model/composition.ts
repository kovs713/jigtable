import type { UserCompositionItem } from "@/jigsaw-room/room-api"

import type { CompositionRef } from "./types"

export function getInitialCompositionRef(
  search: string
): CompositionRef | null {
  const params = new URLSearchParams(search)
  const compositionId = params.get("compositionId")
  const token = params.get("token")

  return compositionId && token
    ? { compositionId, token, jigsawImageUrl: null }
    : null
}

export function parseCompositionInput(value: string): CompositionRef | null {
  const input = value.trim()
  if (!input) return null

  try {
    const url = new URL(input)
    const compositionId = url.searchParams.get("compositionId")
    const token = url.searchParams.get("token")
    if (compositionId && token) {
      return { compositionId, token, jigsawImageUrl: null }
    }
  } catch {
    // Compact codes are handled below.
  }

  const [compositionId, token] = input.split(/[\s:|,]+/).filter(Boolean)
  return compositionId && token
    ? { compositionId, token, jigsawImageUrl: null }
    : null
}

export function formatCompositionDate(value: string | null): string {
  if (!value) return "no date"
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export function formatCompositionTitle(
  composition: UserCompositionItem | null
): string {
  return composition
    ? `${composition.imageCount} images`
    : "Current composition"
}

export function formatCompositionMeta(
  composition: UserCompositionItem
): string {
  const canvas = composition.canvas
    ? `${Math.round(composition.canvas.width)}x${Math.round(composition.canvas.height)}`
    : "canvas pending"
  return `${canvas} · ${formatCompositionDate(composition.createdAt)}`
}
