import { describe, expect, test } from "bun:test"
import { createHash, createHmac } from "node:crypto"

import { TelegramAuthVerifier } from "@/services/auth/telegram/verifier"

const BOT_TOKEN = "123456:test-token"
const NOW = new Date("2026-01-01T00:00:00.000Z")

describe("TelegramAuthVerifier", () => {
  test("verifies Login Widget payload", () => {
    const verifier = createVerifier()
    const payload = signLoginWidgetPayload({
      id: "123456",
      first_name: "Ada",
      username: "ada",
      auth_date: String(Math.floor(NOW.getTime() / 1000)),
    })

    expect(verifier.verifyLoginWidget(payload)).toEqual({
      telegramId: "123456",
      firstName: "Ada",
      username: "ada",
      lastName: undefined,
      photoUrl: undefined,
    })
  })

  test("rejects application fields included in signed payload", () => {
    const verifier = createVerifier()
    const payload = signLoginWidgetPayload({
      id: "123456",
      auth_date: String(Math.floor(NOW.getTime() / 1000)),
    })

    expect(() =>
      verifier.verifyLoginWidget({
        ...payload,
        anonSessionToken: "player-session",
      })
    ).toThrow("Telegram auth invalid")
  })

  test("rejects expired payload", () => {
    const verifier = createVerifier()
    const payload = signLoginWidgetPayload({
      id: "123456",
      auth_date: String(Math.floor(NOW.getTime() / 1000) - 86_401),
    })

    expect(() => verifier.verifyLoginWidget(payload)).toThrow(
      "Telegram auth expired"
    )
  })
})

function createVerifier(): TelegramAuthVerifier {
  return new TelegramAuthVerifier({
    botToken: BOT_TOKEN,
    clock: { now: () => NOW },
  })
}

function signLoginWidgetPayload(
  payload: Record<string, string>
): Record<string, string> {
  const checkString = Object.entries(payload)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")
  const secret = createHash("sha256").update(BOT_TOKEN).digest()
  const hash = createHmac("sha256", secret).update(checkString).digest("hex")

  return { ...payload, hash }
}
