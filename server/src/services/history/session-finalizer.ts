import { createJigsawState } from "@jigtable/core/generate"
import {
  JOIN_CONTRIBUTION_UNITS,
  SNAP_CONTRIBUTION_UNITS,
  type ContributionRegion,
  type FinalPieceContribution,
  type PersistedRoomEvent,
  type PlayerSessionResult,
  type PlayerSessionStats,
  type ScoreBreakdownCode,
  type SessionLabel,
  type SessionSummary,
} from "@jigtable/core/session-history"

import type { ResultParticipant, RoomCompletion } from "./types"

export const SCORING_VERSION = 1
export const CONTRIBUTION_VERSION = 1

type MutablePlayer = {
  result: PlayerSessionResult
  foreignGroupJoins: number
  largestMovingGroup: number
  intervals: {
    active: Array<[number, number]>
    preview: Array<[number, number]>
  }
}

type MutableContributor = {
  playerId: string
  userId: string | null
  units: number
  firstContributionAt: number
}

export function finalizeSession({
  completion,
  participants,
  events,
}: {
  completion: RoomCompletion
  participants: readonly ResultParticipant[]
  events: readonly PersistedRoomEvent[]
}): SessionSummary {
  const orderedEvents = [...events].sort((left, right) =>
    left.sequence === right.sequence
      ? left.eventIndex - right.eventIndex
      : left.sequence - right.sequence
  )
  const participantsByPlayer = new Map(
    participants.flatMap((participant) =>
      participant.playerId ? [[participant.playerId, participant] as const] : []
    )
  )
  const players = new Map<string, MutablePlayer>()
  const pieceContributors = new Map<string, Map<string, MutableContributor>>()
  const firstJoinedPieces = new Set<string>()
  const activeIntervals = new Map<
    string,
    { playerId: string; openedAt: number }
  >()
  const previewIntervals = new Map<
    string,
    { playerId: string; openedAt: number }
  >()
  const completedAt = completion.completedAt.getTime()
  const state = createJigsawState(completion.config)
  let firstBloodPlayerId: string | null = null
  let lastHitPlayerId: string | null = null

  const getPlayer = (playerId: string, eventUserId: string | null) => {
    const existing = players.get(playerId)
    if (existing) {
      if (!existing.result.userId && eventUserId) {
        existing.result.userId = eventUserId
        existing.result.stats.userId = eventUserId
        existing.result.score.userId = eventUserId
      }
      return existing
    }

    const participant = participantsByPlayer.get(playerId)
    const userId = participant?.userId ?? eventUserId
    const stats = createEmptyStats(playerId, userId)
    const result: PlayerSessionResult = {
      playerId,
      userId,
      name: participant?.name ?? playerId,
      color: participant?.color ?? "#808080",
      stats,
      score: {
        playerId,
        userId,
        points: 0,
        scoringVersion: SCORING_VERSION,
        breakdown: { items: [], total: 0 },
      },
      xpGained: 0,
      labels: [],
    }
    const created = {
      result,
      foreignGroupJoins: 0,
      largestMovingGroup: 0,
      intervals: { active: [], preview: [] },
    }
    players.set(playerId, created)
    return created
  }

  for (const participant of participants) {
    if (participant.playerId) {
      getPlayer(participant.playerId, participant.userId ?? null)
    }
  }

  for (const event of orderedEvents) {
    const eventAt = Date.parse(event.createdAt)

    if (event.eventType === "room_completed") {
      const trigger = orderedEvents.find(
        (candidate) => candidate.id === event.payload.triggerEventId
      )
      lastHitPlayerId = trigger?.playerId ?? null
      continue
    }

    const player = getPlayer(event.playerId, event.userId)
    const stats = player.result.stats

    switch (event.eventType) {
      case "command_noop":
        break

      case "piece_joined":
      case "group_joined": {
        const isPieceJoin = event.eventType === "piece_joined"
        const breakdownCode = isPieceJoin ? "piece_join" : "group_join"
        const actionPoints = isPieceJoin ? 10 : 15

        if (!firstBloodPlayerId) firstBloodPlayerId = event.playerId
        if (isPieceJoin) stats.piecesJoined += 1
        else stats.groupsJoined += 1

        addPoints(player.result, breakdownCode, 1, actionPoints, actionPoints)
        stats.largestGroupBuilt = Math.max(
          stats.largestGroupBuilt,
          new Set([
            ...event.payload.movingPieceIds,
            ...event.payload.targetPieceIds,
          ]).size
        )
        player.largestMovingGroup = Math.max(
          player.largestMovingGroup,
          event.payload.movingPieceIds.length
        )

        const targetHadContributors = event.payload.targetPieceIds.some(
          (pieceId) => (pieceContributors.get(pieceId)?.size ?? 0) > 0
        )
        const actorContributedToTarget = event.payload.targetPieceIds.some(
          (pieceId) => pieceContributors.get(pieceId)?.has(event.playerId)
        )
        if (targetHadContributors && !actorContributedToTarget) {
          player.foreignGroupJoins += 1
        }

        for (const pieceId of event.payload.movingPieceIds) {
          addContribution(
            pieceContributors,
            pieceId,
            event.playerId,
            player.result.userId,
            JOIN_CONTRIBUTION_UNITS,
            eventAt
          )

          if (firstJoinedPieces.has(pieceId)) continue
          firstJoinedPieces.add(pieceId)

          const definition = state.definitions[pieceId]
          if (!definition) continue

          const onHorizontalEdge =
            definition.row === 0 ||
            definition.row === completion.config.rows - 1
          const onVerticalEdge =
            definition.col === 0 ||
            definition.col === completion.config.cols - 1

          if (onHorizontalEdge && onVerticalEdge) {
            stats.cornerPiecesJoined += 1
            addPoints(player.result, "corner_piece", 1, 8, 8)
          } else if (onHorizontalEdge || onVerticalEdge) {
            stats.borderPiecesJoined += 1
            addPoints(player.result, "border_piece", 1, 3, 3)
          }
        }
        break
      }

      case "group_snapped": {
        const rawPoints = event.payload.pieceIds.length * 2
        const points = Math.min(rawPoints, 30)
        stats.groupsSnapped += 1
        stats.piecesSnapped += event.payload.pieceIds.length
        addPoints(
          player.result,
          "placement",
          1,
          rawPoints,
          points,
          rawPoints > points ? 30 : undefined
        )
        for (const pieceId of event.payload.pieceIds) {
          addContribution(
            pieceContributors,
            pieceId,
            event.playerId,
            player.result.userId,
            SNAP_CONTRIBUTION_UNITS,
            eventAt
          )
        }
        break
      }

      case "ping_created":
        stats.pingsCreated += 1
        break

      case "group_locked":
        stats.locksUsed += 1
        break

      case "player_connected":
        activeIntervals.set(event.payload.presenceId, {
          playerId: event.playerId,
          openedAt: eventAt,
        })
        break

      case "player_disconnected": {
        const interval = activeIntervals.get(event.payload.presenceId)
        if (interval) {
          getPlayer(interval.playerId, null).intervals.active.push([
            interval.openedAt,
            Math.min(eventAt, completedAt),
          ])
          activeIntervals.delete(event.payload.presenceId)
        }
        break
      }

      case "preview_opened":
        previewIntervals.set(event.payload.intervalId, {
          playerId: event.playerId,
          openedAt: eventAt,
        })
        break

      case "preview_closed": {
        const interval = previewIntervals.get(event.payload.intervalId)
        if (interval) {
          getPlayer(interval.playerId, null).intervals.preview.push([
            interval.openedAt,
            Math.min(eventAt, completedAt),
          ])
          previewIntervals.delete(event.payload.intervalId)
        }
        break
      }

      case "group_unlocked":
        break
    }
  }

  for (const interval of activeIntervals.values()) {
    getPlayer(interval.playerId, null).intervals.active.push([
      interval.openedAt,
      completedAt,
    ])
  }
  for (const interval of previewIntervals.values()) {
    getPlayer(interval.playerId, null).intervals.preview.push([
      interval.openedAt,
      Math.min(completedAt, interval.openedAt + 60_000),
    ])
  }

  const pieces = buildFinalPieceContributions(
    Object.keys(state.definitions),
    pieceContributors
  )
  const regions = buildContributionRegions(state, pieces)
  const totalContributionUnits = pieces.reduce(
    (sum, piece) =>
      sum +
      piece.contributors.reduce((pieceSum, item) => pieceSum + item.units, 0),
    0
  )

  for (const piece of pieces) {
    for (const contributor of piece.contributors) {
      const player = getPlayer(contributor.playerId, contributor.userId)
      player.result.stats.contributionUnits += contributor.units
    }
    if (piece.primaryContributorPlayerId) {
      getPlayer(
        piece.primaryContributorPlayerId,
        null
      ).result.stats.primaryPieces += 1
    }
  }

  for (const region of regions) {
    const stats = getPlayer(region.playerId, null).result.stats
    stats.regionCount += 1
    stats.largestRegionSize = Math.max(
      stats.largestRegionSize,
      region.pieceIds.length
    )
  }

  for (const player of players.values()) {
    const { result, intervals } = player
    result.stats.activeMs = measureIntervals(intervals.active)
    result.stats.previewMs = Math.min(
      completion.elapsedMs,
      10 * 60_000,
      measureIntervals(intervals.preview)
    )
    result.stats.contributionPercentage =
      totalContributionUnits > 0
        ? (result.stats.contributionUnits / totalContributionUnits) * 100
        : 0
    result.stats.firstBlood = result.playerId === firstBloodPlayerId
    result.stats.lastHit = result.playerId === lastHitPlayerId
    if (result.stats.firstBlood) addPoints(result, "first_blood", 1, 25, 25)
    if (result.stats.lastHit) addPoints(result, "last_hit", 1, 35, 35)
    result.score.points = result.score.breakdown.total
    result.stats.points = result.score.points

    const hasGameplayContribution =
      result.stats.piecesJoined +
        result.stats.groupsJoined +
        result.stats.groupsSnapped >
      0
    result.xpGained = result.userId
      ? Math.floor(result.score.points * 0.5) +
        (hasGameplayContribution ? 25 : 0)
      : 0
    result.stats.xpGained = result.xpGained
  }

  assignLabels(players, firstBloodPlayerId, lastHitPlayerId)

  return {
    sessionId: completion.roomId,
    roomId: completion.roomId,
    completedAt: completion.completedAt.toISOString(),
    durationMs: completion.elapsedMs,
    scoringVersion: SCORING_VERSION,
    contributionVersion: CONTRIBUTION_VERSION,
    players: [...players.values()]
      .map((player) => player.result)
      .sort((left, right) => compareIds(left.playerId, right.playerId)),
    pieces,
    regions,
  }
}

function createEmptyStats(
  playerId: string,
  userId: string | null
): PlayerSessionStats {
  return {
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
}

function addContribution(
  contributions: Map<string, Map<string, MutableContributor>>,
  pieceId: string,
  playerId: string,
  userId: string | null,
  units: number,
  contributedAt: number
): void {
  const piece = contributions.get(pieceId) ?? new Map()
  const contributor = piece.get(playerId)

  if (contributor) contributor.units += units
  else {
    piece.set(playerId, {
      playerId,
      userId,
      units,
      firstContributionAt: contributedAt,
    })
  }
  contributions.set(pieceId, piece)
}

function buildFinalPieceContributions(
  pieceIds: readonly string[],
  contributions: ReadonlyMap<string, Map<string, MutableContributor>>
): FinalPieceContribution[] {
  return [...pieceIds].sort(compareIds).map((pieceId) => {
    const contributors = [...(contributions.get(pieceId)?.values() ?? [])].sort(
      (left, right) =>
        right.units - left.units ||
        left.firstContributionAt - right.firstContributionAt ||
        compareIds(left.playerId, right.playerId)
    )

    return {
      pieceId,
      primaryContributorPlayerId: contributors[0]?.playerId ?? null,
      contributors,
    }
  })
}

function buildContributionRegions(
  state: ReturnType<typeof createJigsawState>,
  pieces: readonly FinalPieceContribution[]
): ContributionRegion[] {
  const owners = new Map(
    pieces.map((piece) => [piece.pieceId, piece.primaryContributorPlayerId])
  )
  const visited = new Set<string>()
  const regions: ContributionRegion[] = []

  for (const pieceId of [...owners.keys()].sort(compareIds)) {
    const playerId = owners.get(pieceId)
    if (!playerId || visited.has(pieceId)) continue

    const regionPieceIds: string[] = []
    const queue = [pieceId]
    visited.add(pieceId)

    while (queue.length > 0) {
      const current = queue.shift()!
      regionPieceIds.push(current)
      const neighbors = state.definitions[current]?.neighbors ?? []

      for (const relation of [...neighbors].sort((left, right) =>
        compareIds(left.neighborId, right.neighborId)
      )) {
        if (
          !visited.has(relation.neighborId) &&
          owners.get(relation.neighborId) === playerId
        ) {
          visited.add(relation.neighborId)
          queue.push(relation.neighborId)
        }
      }
    }

    regionPieceIds.sort(compareIds)
    regions.push({
      id: `region:${playerId}:${regionPieceIds[0]}`,
      playerId,
      pieceIds: regionPieceIds,
    })
  }

  return regions
}

function addPoints(
  result: PlayerSessionResult,
  code: ScoreBreakdownCode,
  count: number,
  rawPoints: number,
  points: number,
  capApplied?: number
): void {
  let item = result.score.breakdown.items.find((entry) => entry.code === code)

  if (!item) {
    item = { code, count: 0, rawPoints: 0, points: 0 }
    result.score.breakdown.items.push(item)
  }

  item.count += count
  item.rawPoints += rawPoints
  item.points += points
  if (capApplied !== undefined) item.capApplied = capApplied
  result.score.breakdown.total += points
}

function measureIntervals(intervals: readonly [number, number][]): number {
  const sorted = intervals
    .filter(([start, end]) => end > start)
    .sort((left, right) => left[0] - right[0])
  let total = 0
  let current: [number, number] | null = null

  for (const interval of sorted) {
    if (!current) current = [...interval]
    else if (interval[0] <= current[1])
      current[1] = Math.max(current[1], interval[1])
    else {
      total += current[1] - current[0]
      current = [...interval]
    }
  }

  return total + (current ? current[1] - current[0] : 0)
}

function assignLabels(
  players: ReadonlyMap<string, MutablePlayer>,
  firstBloodPlayerId: string | null,
  lastHitPlayerId: string | null
): void {
  const values = [...players.values()]
  if (firstBloodPlayerId) addLabel(players, firstBloodPlayerId, "first_blood")
  if (lastHitPlayerId) addLabel(players, lastHitPlayerId, "last_hit")

  awardMax(values, "mvp", (player) => player.result.score.points)
  awardMax(
    values,
    "glue_master",
    (player) =>
      player.result.stats.piecesJoined + player.result.stats.groupsJoined
  )
  awardMax(values, "closer", (player) => player.result.stats.groupsSnapped)
  awardMax(
    values,
    "wall_builder",
    (player) => player.result.stats.borderPiecesJoined
  )
  awardMax(
    values,
    "corner_hunter",
    (player) => player.result.stats.cornerPiecesJoined
  )
  awardMax(values, "biggest_build", (player) => player.largestMovingGroup, 2)
  awardMax(
    values,
    "largest_region",
    (player) => player.result.stats.largestRegionSize
  )
  awardMax(
    values,
    "ping_lord",
    (player) => Math.min(player.result.stats.pingsCreated, 20),
    3
  )
  awardMax(
    values,
    "preview_enjoyer",
    (player) => player.result.stats.previewMs,
    30_000
  )
  awardMax(
    values,
    "locksmith",
    (player) => Math.min(player.result.stats.locksUsed, 20),
    2
  )
  awardMax(values, "team_player", (player) => player.foreignGroupJoins)
}

function awardMax(
  players: readonly MutablePlayer[],
  label: SessionLabel,
  readValue: (player: MutablePlayer) => number,
  minimum = 1
): void {
  const maximum = Math.max(0, ...players.map(readValue))
  if (maximum < minimum) return

  for (const player of players) {
    if (readValue(player) === maximum) player.result.labels.push(label)
  }
}

function addLabel(
  players: ReadonlyMap<string, MutablePlayer>,
  playerId: string,
  label: SessionLabel
): void {
  const labels = players.get(playerId)?.result.labels
  if (labels && !labels.includes(label)) labels.push(label)
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
