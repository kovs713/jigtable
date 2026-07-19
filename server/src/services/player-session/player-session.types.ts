import type { Player, PlayerSession } from "@jigtable/core/protocol"

export type { Player, PlayerSession }

export type StoredPlayerSession = PlayerSession & {
  userId?: string
}

export type RestorePlayerSessionInput = {
  token?: string
  name?: string
  color?: string
}

export type UpdatePlayerProfileInput = {
  name?: string
  color?: string
}
