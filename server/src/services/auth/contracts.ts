import type { TelegramIdentity } from "./telegram/types"
import type { UpdateUserProfileInput, User } from "./types"

export type StoredAuthSession = {
  userId: string
  expiresAt: Date
}

export type CreateAuthSessionInput = {
  tokenHash: string
  userId: string
  createdAt: Date
  expiresAt: Date
}

export interface AuthSessionRepository {
  create(input: CreateAuthSessionInput): Promise<void>

  findActiveByTokenHash(
    tokenHash: string,
    now: Date
  ): Promise<StoredAuthSession | null>

  touch(tokenHash: string, updatedAt: Date): Promise<void>

  deleteByTokenHash(tokenHash: string): Promise<void>
}

export type UpsertTelegramUserInput = {
  identity: TelegramIdentity
  newUserProfile: {
    displayName: string
    color: string
  }
  now: Date
}

export interface UserRepository {
  findById(userId: string): Promise<User | null>

  upsertTelegramUser(input: UpsertTelegramUserInput): Promise<User>

  updateProfile(
    userId: string,
    input: UpdateUserProfileInput,
    updatedAt: Date
  ): Promise<User | null>
}

export interface TelegramAccessPolicy {
  isAllowed(telegramId: string): Promise<boolean>
}

export interface AuthTokenCodec {
  create(): string
  hash(token: string): string
}

export interface Clock {
  now(): Date
}
