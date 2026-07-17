import { describe, expect, test } from "bun:test"

import { parseStoredPlayerSession } from "./player-session-mapper"

describe("player session mapper", () => {
  test("uses the queried key token over persisted JSON", () => {
    expect(
      parseStoredPlayerSession({
        fallbackToken: "session_from_key",
        fallbackTimestamp: 1_000,
        value: {
          token: "session_from_json",
          player: {
            id: "player-1",
            name: "Player 1",
            color: "#123abc",
          },
          createdAt: 100,
          updatedAt: 200,
        },
      })
    ).toEqual({
      token: "session_from_key",
      player: {
        id: "player-1",
        name: "Player 1",
        color: "#123abc",
      },
      userId: undefined,
      createdAt: 100,
      updatedAt: 200,
    })
  })

  test("uses the queried key token for legacy JSON without one", () => {
    expect(
      parseStoredPlayerSession({
        fallbackToken: "session_from_key",
        fallbackTimestamp: 1_000,
        value: {
          player: {
            id: "player-1",
            name: "Player 1",
            color: "#123abc",
          },
        },
      })?.token
    ).toBe("session_from_key")
  })
})
