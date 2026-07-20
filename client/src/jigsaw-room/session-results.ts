import type {
  PlayerSessionResult,
  SessionLabel,
} from "@jigtable/core/session-history"

export const SESSION_LABELS: Record<SessionLabel, string> = {
  mvp: "MVP",
  first_blood: "First Blood",
  last_hit: "Last Hit",
  glue_master: "Glue Master",
  closer: "Closer",
  wall_builder: "Wall Builder",
  corner_hunter: "Corner Hunter",
  biggest_build: "Biggest Build",
  largest_region: "Largest Region",
  ping_lord: "Ping Lord",
  preview_enjoyer: "Preview Enjoyer",
  locksmith: "Locksmith",
  team_player: "Team Player",
}

export function comparePlayerResults(
  left: PlayerSessionResult,
  right: PlayerSessionResult
): number {
  return (
    right.score.points - left.score.points ||
    right.stats.contributionPercentage - left.stats.contributionPercentage ||
    left.name.localeCompare(right.name)
  )
}

export function formatContributionPercentage(value: number): string {
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)}%`
}
