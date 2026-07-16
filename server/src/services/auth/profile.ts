import type { UpdateUserProfileInput } from "./types"

const USER_NAME_MAX_LENGTH = 24
const DEFAULT_DISPLAY_NAME = "Player"
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/

export function normalizeDisplayName(
  value: string | null | undefined
): string | null {
  const normalized = value?.trim().replace(/\s+/g, " ")

  return normalized ? normalized.slice(0, USER_NAME_MAX_LENGTH) : null
}

export function normalizeUserColor(
  value: string | null | undefined
): string | null {
  const normalized = value?.trim().toLowerCase()

  return normalized && HEX_COLOR_PATTERN.test(normalized) ? normalized : null
}

export function normalizeProfileUpdate(
  input: UpdateUserProfileInput
): UpdateUserProfileInput {
  const update: UpdateUserProfileInput = {}

  if (input.displayName !== undefined) {
    update.displayName =
      normalizeDisplayName(input.displayName) ?? DEFAULT_DISPLAY_NAME
  }

  if (input.color !== undefined) {
    const color = normalizeUserColor(input.color)

    if (color) {
      update.color = color
    }
  }

  return update
}
