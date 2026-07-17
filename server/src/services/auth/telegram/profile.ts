import { colorFromSeed } from "@jigtable/shared/utils"

import { normalizeDisplayName, normalizeUserColor } from "../profile"
import type { ProfileSeed } from "../types"
import type { TelegramIdentity } from "./types"

export function resolveTelegramUserProfile(
  identity: TelegramIdentity,
  profileSeed?: ProfileSeed
): { displayName: string; color: string } {
  return {
    displayName:
      normalizeDisplayName(profileSeed?.displayName) ??
      resolveTelegramDisplayName(identity),
    color:
      normalizeUserColor(profileSeed?.color) ??
      colorFromSeed(identity.telegramId),
  }
}

export function resolveTelegramDisplayName(identity: TelegramIdentity): string {
  const fullName = [identity.firstName, identity.lastName]
    .filter(Boolean)
    .join(" ")

  return (
    normalizeDisplayName(fullName || identity.username) ??
    `tg_${identity.telegramId}`
  )
}
