import type { PlayerSession as JigsawSession } from "@jigtable/core/protocol"

export type { JigsawSession }

export type StoredJigsawSession = JigsawSession & {
  userId?: string
}

export type RestoreSessionInput = {
  token?: string
  name?: string
  color?: string
}

export type UpdateSessionInput = {
  name?: string
  color?: string
}
