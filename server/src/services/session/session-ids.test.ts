import { expect, test } from "bun:test"

import { sessionKey } from "./session-ids"

test("keeps the persisted jigsaw session key prefix", () => {
  expect(sessionKey("session_123")).toBe("jigsaw:session:session_123")
})
