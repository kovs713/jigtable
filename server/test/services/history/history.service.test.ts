import { describe, expect, test } from "bun:test"

import type { PlayerSessionResult } from "@jigtable/core/session-history"

import type { HistoryRepository } from "@/db/repositories"
import { HistoryService, type RoomResult } from "@/services/history"

describe("HistoryService", () => {
  test("applies current user colors to participants and summary players", async () => {
    const stored = createRoomResult()
    const requestedUserIds: string[][] = []
    const service = new HistoryService(
      createRepository({
        async findRoomResult() {
          return stored
        },
        async findUserColors(userIds) {
          requestedUserIds.push([...userIds])
          return new Map([
            ["user-1", "#111111"],
            ["user-2", "#222222"],
          ])
        },
      })
    )

    const result = await service.getRoomResult(stored.roomId)

    expect(new Set(requestedUserIds[0])).toEqual(new Set(["user-1", "user-2"]))
    expect(result?.participants[0]?.color).toBe("#111111")
    expect(result?.summary?.players.map((player) => player.color)).toEqual([
      "#111111",
      "#222222",
      "#cccccc",
    ])
    expect(stored.participants[0]?.color).toBe("#aaaaaa")
    expect(stored.summary?.players[0]?.color).toBe("#aaaaaa")
  })
})

function createRepository(
  overrides: Partial<HistoryRepository>
): HistoryRepository {
  return {
    async upsertParticipant() {},
    async markParticipantLeft() {},
    async updateParticipantProfile() {},
    async linkSessionToUser() {},
    async saveCompletion() {},
    async listPendingCompletions() {
      return []
    },
    async listUserHistory() {
      return []
    },
    async findRoomResult() {
      return null
    },
    async findUserColors() {
      return new Map()
    },
    ...overrides,
  }
}

function createRoomResult(): RoomResult {
  const players = [
    createPlayer("player-1", "user-1", "#aaaaaa"),
    createPlayer("player-2", "user-2", "#bbbbbb"),
    createPlayer("player-3", null, "#cccccc"),
  ]

  return {
    roomId: "room-1",
    imageUrl: "/puzzle.png",
    config: {
      rows: 2,
      cols: 2,
      pieceWidth: 50,
      pieceHeight: 50,
      originX: 0,
      originY: 0,
      scatterPadding: 10,
      scatterGap: 5,
      snapToCorrectDistance: 10,
      snapToNeighborDistance: 10,
      tabSizePercent: 0.2,
      jitterPercent: 0,
      pieceTextureScale: 1,
      minZoom: 0.5,
      maxZoom: 2,
      seed: 1,
    },
    elapsedMs: 1_000,
    pieceCount: 4,
    snapCount: 2,
    completedAt: new Date("2026-07-20T00:00:00.000Z"),
    participants: [
      {
        playerId: "player-1",
        userId: "user-1",
        name: "Player 1",
        color: "#aaaaaa",
      },
    ],
    summary: {
      sessionId: "room-1",
      roomId: "room-1",
      completedAt: "2026-07-20T00:00:00.000Z",
      durationMs: 1_000,
      scoringVersion: 1,
      contributionVersion: 1,
      players,
      pieces: [],
      regions: [],
    },
  }
}

function createPlayer(
  playerId: string,
  userId: string | null,
  color: string
): PlayerSessionResult {
  const stats = {
    playerId,
    userId,
    points: 0,
    xpGained: 0,
    piecesJoined: 0,
    groupsJoined: 0,
    piecesSnapped: 0,
    groupsSnapped: 0,
    pingsCreated: 0,
    locksUsed: 0,
    previewMs: 0,
    activeMs: 0,
    borderPiecesJoined: 0,
    cornerPiecesJoined: 0,
    largestGroupBuilt: 0,
    primaryPieces: 0,
    contributionUnits: 0,
    contributionPercentage: 0,
    regionCount: 0,
    largestRegionSize: 0,
    firstBlood: false,
    lastHit: false,
  }

  return {
    playerId,
    userId,
    name: playerId,
    color,
    stats,
    score: {
      playerId,
      userId,
      points: 0,
      scoringVersion: 1,
      breakdown: { items: [], total: 0 },
    },
    xpGained: 0,
    labels: [],
  }
}
