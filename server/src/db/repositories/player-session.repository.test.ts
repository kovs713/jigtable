import { describe, expect, test } from "bun:test"

import type { StoredPlayerSession } from "@/services/player-session"
import { DrizzlePlayerSessionRepository } from "./player-session.repository"

const session: StoredPlayerSession = {
  token: "session_12345678901234567890123456789012",
  player: {
    id: "player-1",
    name: "Player 1",
    color: "#123abc",
  },
  createdAt: 1,
  updatedAt: 2,
}

describe("DrizzlePlayerSessionRepository", () => {
  test("reads sessions from Redis before PostgreSQL", async () => {
    const cache = new FakeCache(JSON.stringify(session))
    const db = {
      select() {
        throw new Error("PostgreSQL should not be queried on cache hit")
      },
    }
    const repository = new DrizzlePlayerSessionRepository(cache, db as never)

    expect(await repository.findByToken(session.token)).toEqual(session)
  })

  test("ignores invalid cached sessions", async () => {
    const cache = new FakeCache("invalid-json")
    const db = createEmptyDatabase()
    const repository = new DrizzlePlayerSessionRepository(cache, db as never)

    expect(await repository.findByToken(session.token)).toBeNull()
    expect(cache.deleted).toEqual([session.token])
  })

  test("caches sessions loaded from PostgreSQL", async () => {
    const cache = new FakeCache(null)
    const db = createDatabase([
      {
        value: session,
        updatedAt: new Date(session.updatedAt),
      },
    ])
    const repository = new DrizzlePlayerSessionRepository(cache, db as never)

    expect(await repository.findByToken(session.token)).toEqual(session)
    expect(cache.writes).toEqual([[session.token, JSON.stringify(session)]])
  })

  test("updates Redis after saving to PostgreSQL", async () => {
    const cache = new FakeCache(null)
    let persisted = false
    const db = {
      insert() {
        return {
          values() {
            return {
              async onConflictDoUpdate() {
                persisted = true
              },
            }
          },
        }
      },
    }
    const repository = new DrizzlePlayerSessionRepository(cache, db as never)

    await repository.save(session)

    expect(persisted).toBeTrue()
    expect(cache.writes).toEqual([[session.token, JSON.stringify(session)]])
  })
})

class FakeCache {
  readonly deleted: string[] = []
  readonly writes: Array<[string, string]> = []

  constructor(private readonly value: string | null) {}

  async get(): Promise<string | null> {
    return this.value
  }

  async set(key: string, value: string): Promise<void> {
    this.writes.push([key, value])
  }

  async delete(key: string): Promise<void> {
    this.deleted.push(key)
  }
}

function createEmptyDatabase() {
  return createDatabase([])
}

function createDatabase(rows: unknown[]) {
  return {
    select() {
      return {
        from() {
          return {
            where() {
              return {
                async limit() {
                  return rows
                },
              }
            },
          }
        },
      }
    },
  }
}
