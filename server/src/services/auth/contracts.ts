import type { TelegramIdentity } from "./telegram/types"

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

export type UpsertTelegramUserInput = {
  identity: TelegramIdentity
  newUserProfile: {
    displayName: string
    color: string
  }
  now: Date
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
