import type { PlayerSessionRepository } from "@/db/repositories"
import { createPlayerProfile, updatePlayerProfile } from "./player-profile"
import {
  createPlayerSessionToken,
  normalizePlayerSessionToken,
} from "./player-session-token"
import type {
  RestorePlayerSessionInput,
  StoredPlayerSession,
  UpdatePlayerProfileInput,
} from "./player-session.types"

type PlayerSessionServiceOptions = {
  now?: () => number
}

export class PlayerSessionService {
  private readonly now: () => number

  constructor(
    private readonly repository: PlayerSessionRepository,
    options: PlayerSessionServiceOptions = {}
  ) {
    this.now = options.now ?? Date.now
  }

  async restore(
    input: RestorePlayerSessionInput = {}
  ): Promise<StoredPlayerSession> {
    const token = normalizePlayerSessionToken(input.token)

    if (token) {
      const existing = await this.repository.findByToken(token)

      if (existing) {
        return existing
      }
    }

    return this.create(input)
  }

  async get(token: string): Promise<StoredPlayerSession | null> {
    const normalizedToken = normalizePlayerSessionToken(token)

    return normalizedToken ? this.repository.findByToken(normalizedToken) : null
  }

  async updateProfile(
    token: string,
    input: UpdatePlayerProfileInput
  ): Promise<StoredPlayerSession | null> {
    const current = await this.get(token)

    if (!current) {
      return null
    }

    const session = {
      ...current,
      player: updatePlayerProfile(current.player, input),
      updatedAt: this.now(),
    } satisfies StoredPlayerSession

    await this.repository.save(session)

    return session
  }

  async linkToUser(
    token: string,
    userId: string
  ): Promise<StoredPlayerSession | null> {
    const current = await this.get(token)
    const normalizedUserId = userId.trim()

    if (!current || !normalizedUserId) {
      return null
    }

    if (current.userId === normalizedUserId) {
      return current
    }

    const session = {
      ...current,
      userId: normalizedUserId,
      updatedAt: this.now(),
    } satisfies StoredPlayerSession

    await this.repository.save(session)

    return session
  }

  private async create(
    input: RestorePlayerSessionInput
  ): Promise<StoredPlayerSession> {
    const now = this.now()
    const session = {
      token: createPlayerSessionToken(),
      player: createPlayerProfile(input),
      createdAt: now,
      updatedAt: now,
    } satisfies StoredPlayerSession

    await this.repository.save(session)

    return session
  }
}
