export type UpsertParticipantInput = {
  roomId: string
  playerId: string
  sessionHash: string
  userId: string | null
  name: string
  color: string
  seenAt: Date
}

export type UpdateParticipantProfileInput = {
  sessionHash: string
  userId: string | null
  name: string
  color: string
  seenAt: Date
}
