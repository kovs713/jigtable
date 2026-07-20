import { describe, expect, test } from "bun:test"

import { DEFAULT_JIGSAW_CONFIG } from "@jigtable/core/config"
import type { PersistedRoomEvent } from "@jigtable/core/session-history"

import { finalizeSession } from "@/services/history/session-finalizer"

const config = {
  ...DEFAULT_JIGSAW_CONFIG,
  rows: 2,
  cols: 2,
}
const completedAt = new Date("2026-01-01T00:01:00.000Z")

describe("finalizeSession", () => {
  test("keeps target contribution unchanged and stores integer units", () => {
    const events = [
      playerEvent(1, "group_joined", "player-b", {
        movingGroupId: "group-b",
        targetGroupId: "group-target",
        resultGroupId: "group-b",
        movingPieceIds: ["piece-0-0", "piece-0-1"],
        targetPieceIds: ["piece-1-0"],
      }),
      playerEvent(2, "piece_joined", "player-a", {
        movingGroupId: "group-a",
        targetGroupId: "group-b",
        resultGroupId: "group-a",
        movingPieceIds: ["piece-1-1"],
        targetPieceIds: ["piece-0-0", "piece-0-1", "piece-1-0"],
      }),
      playerEvent(3, "group_snapped", "player-a", {
        groupId: "group-a",
        pieceIds: ["piece-0-0", "piece-0-1", "piece-1-0", "piece-1-1"],
      }),
      systemEvent(4, "event-3"),
    ]
    const summary = finalizeSession({
      completion: createCompletion(),
      participants: [
        {
          playerId: "player-a",
          userId: null,
          name: "A",
          color: "#ff0000",
        },
        {
          playerId: "player-b",
          userId: null,
          name: "B",
          color: "#0000ff",
        },
      ],
      events,
    })

    const movedByB = summary.pieces.find(
      (piece) => piece.pieceId === "piece-0-0"
    )!
    const targetOnly = summary.pieces.find(
      (piece) => piece.pieceId === "piece-1-0"
    )!
    const playerA = summary.players.find(
      (player) => player.playerId === "player-a"
    )!

    expect(movedByB.primaryContributorPlayerId).toBe("player-b")
    expect(movedByB.contributors).toEqual([
      expect.objectContaining({ playerId: "player-b", units: 5 }),
      expect.objectContaining({ playerId: "player-a", units: 1 }),
    ])
    expect(targetOnly.contributors).toEqual([
      expect.objectContaining({ playerId: "player-a", units: 1 }),
    ])
    expect(playerA.stats.lastHit).toBe(true)
    expect(playerA.xpGained).toBeGreaterThan(0)
    expect(
      summary.players.find((player) => player.playerId === "player-b")?.xpGained
    ).toBe(0)
  })

  test("breaks equal-unit ties by first contribution sequence", () => {
    const summary = finalizeSession({
      completion: createCompletion(),
      participants: [],
      events: [
        playerEvent(1, "piece_joined", "player-b", {
          movingGroupId: "group-b",
          targetGroupId: "group-target",
          resultGroupId: "group-b",
          movingPieceIds: ["piece-0-0"],
          targetPieceIds: ["piece-0-1"],
        }),
        playerEvent(2, "piece_joined", "player-a", {
          movingGroupId: "group-a",
          targetGroupId: "group-b",
          resultGroupId: "group-a",
          movingPieceIds: ["piece-0-0"],
          targetPieceIds: ["piece-0-1"],
        }),
      ],
    })

    expect(
      summary.pieces.find((piece) => piece.pieceId === "piece-0-0")
        ?.primaryContributorPlayerId
    ).toBe("player-b")
  })
})

function playerEvent(
  sequence: number,
  eventType: "piece_joined" | "group_joined" | "group_snapped",
  playerId: string,
  payload: Record<string, unknown>
): PersistedRoomEvent {
  return {
    id: `event-${sequence}`,
    roomId: "room-1",
    sequence,
    commandId: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    eventIndex: 0,
    eventType,
    playerId,
    userId:
      playerId === "player-a" ? "00000000-0000-4000-8000-000000000001" : null,
    payload,
    createdAt: new Date(sequence * 1_000).toISOString(),
  } as PersistedRoomEvent
}

function systemEvent(
  sequence: number,
  triggerEventId: string
): PersistedRoomEvent {
  return {
    id: `event-${sequence}`,
    roomId: "room-1",
    sequence,
    commandId: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    eventIndex: 1,
    eventType: "room_completed",
    playerId: null,
    userId: null,
    payload: {
      triggerEventId,
      completedAt: completedAt.toISOString(),
      elapsedMs: 60_000,
      pieceCount: 4,
      snapCount: 3,
      jigsawConfig: config,
      assetRef: { kind: "development", assetId: "asset-1" },
      imageUrl: "/image.png",
    },
    createdAt: completedAt.toISOString(),
  }
}

function createCompletion() {
  return {
    roomId: "room-1",
    assetRef: { kind: "development" as const, assetId: "asset-1" },
    config,
    imageUrl: "/image.png",
    elapsedMs: 60_000,
    pieceCount: 4,
    snapCount: 3,
    completedAt,
  }
}
