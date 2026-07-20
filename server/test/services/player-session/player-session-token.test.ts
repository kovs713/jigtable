import { expect, test } from "bun:test"

import { playerSessionStorageKey } from "@/services/player-session/player-session-token"

test("keeps the persisted player session key prefix", () => {
  expect(playerSessionStorageKey("session_123")).toBe(
    "jigsaw:session:session_123"
  )
})
