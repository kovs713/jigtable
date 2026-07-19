import { SHA256 } from "bun"

import type { HistoryRepository } from "@/db/repositories"
import type {
  HistoryEntry,
  ParticipantSession,
  ResultParticipant,
  RoomCompletion,
  RoomResult,
} from "./types"

type HistoryServiceOptions = {
  now?: () => Date
  hashSessionToken?: (token: string) => string
}

type ParticipantContainer = {
  participants: readonly ResultParticipant[]
}

export class HistoryService {
  private readonly now: () => Date
  private readonly hashSessionToken: (token: string) => string

  constructor(
    private readonly repository: HistoryRepository,
    options: HistoryServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date())
    this.hashSessionToken =
      options.hashSessionToken ?? ((token: string) => SHA256.hash(token, "hex"))
  }

  async syncParticipant({
    roomId,
    session,
  }: {
    roomId: string
    session: ParticipantSession
  }): Promise<void> {
    await this.repository.upsertParticipant({
      roomId,
      playerId: session.player.id,
      sessionHash: this.hashSessionToken(session.token),
      userId: session.userId ?? null,
      name: session.player.name,
      color: session.player.color,
      seenAt: this.now(),
    })
  }

  async markParticipantLeft(roomId: string, playerId: string): Promise<void> {
    await this.repository.markParticipantLeft({
      roomId,
      playerId,
      leftAt: this.now(),
    })
  }

  async updateParticipantProfile({
    sessionToken,
    profile,
    userId,
  }: {
    sessionToken: string
    profile: {
      name: string
      color: string
    }
    userId?: string | null
  }): Promise<void> {
    await this.repository.updateParticipantProfile({
      sessionHash: this.hashSessionToken(sessionToken),
      userId: userId ?? null,
      name: profile.name,
      color: profile.color,
      seenAt: this.now(),
    })
  }

  async linkPlayerSessionToUser(
    sessionToken: string,
    userId: string
  ): Promise<void> {
    await this.repository.linkSessionToUser({
      sessionHash: this.hashSessionToken(sessionToken),
      userId,
      linkedAt: this.now(),
    })
  }

  async recordCompletion(completion: RoomCompletion): Promise<void> {
    await this.repository.saveCompletion(completion)
  }

  async listUserHistory(userId: string): Promise<HistoryEntry[]> {
    const entries = await this.repository.listUserHistory(userId)
    const colors = await this.loadCurrentUserColors(entries)

    return entries.map((entry) => ({
      ...entry,
      participants: applyParticipantColors(entry.participants, colors),
    }))
  }

  async getRoomResult(roomId: string): Promise<RoomResult | null> {
    const result = await this.repository.findRoomResult(roomId)

    if (!result) {
      return null
    }

    const colors = await this.loadCurrentUserColors([result])

    return {
      ...result,
      participants: applyParticipantColors(result.participants, colors),
    }
  }

  private async loadCurrentUserColors(
    items: readonly ParticipantContainer[]
  ): Promise<Map<string, string>> {
    const userIds = [
      ...new Set(
        items.flatMap((item) =>
          item.participants.flatMap((participant) =>
            participant.userId ? [participant.userId] : []
          )
        )
      ),
    ]

    return userIds.length > 0
      ? this.repository.findUserColors(userIds)
      : new Map()
  }
}

function applyParticipantColors(
  participants: readonly ResultParticipant[],
  colors: ReadonlyMap<string, string>
): ResultParticipant[] {
  return participants.map((participant) => {
    const color = participant.userId
      ? colors.get(participant.userId)
      : undefined

    return color ? { ...participant, color } : participant
  })
}
