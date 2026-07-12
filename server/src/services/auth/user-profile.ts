import type { TelegramAuthProfile } from "./auth-types"

const USER_NAME_MAX_LENGTH = 24

export function profileName(profile: TelegramAuthProfile): string {
  return (
    normalizeName(
      [profile.firstName, profile.lastName].filter(Boolean).join(" ") ||
        profile.username
    ) ?? `tg_${profile.telegramId}`
  )
}

export function normalizeName(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/\s+/g, " ")

  return trimmed ? trimmed.slice(0, USER_NAME_MAX_LENGTH) : null
}

export function normalizeColor(value: string | undefined): string | null {
  const color = value?.trim().toLowerCase()

  return color && /^#[0-9a-f]{6}$/.test(color) ? color : null
}

export function colorFromSeed(seed: string): string {
  let hash = 0

  for (let index = 0; index < seed.length; index++) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  }

  return hslToHex((hash % 360) / 360, 0.72, 0.58)
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const x = chroma * (1 - Math.abs(((hue * 6) % 2) - 1))
  const match = lightness - chroma / 2
  const sector = Math.floor(hue * 6)

  const [red, green, blue] =
    sector === 0
      ? [chroma, x, 0]
      : sector === 1
        ? [x, chroma, 0]
        : sector === 2
          ? [0, chroma, x]
          : sector === 3
            ? [0, x, chroma]
            : sector === 4
              ? [x, 0, chroma]
              : [chroma, 0, x]

  return `#${toHex(red + match)}${toHex(green + match)}${toHex(blue + match)}`
}

function toHex(value: number): string {
  return Math.round(value * 255)
    .toString(16)
    .padStart(2, "0")
}
