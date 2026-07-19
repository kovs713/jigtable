import type { AuthSessionRepository, UserRepository } from "@/db/repositories"
import type { AuthTokenCodec, Clock, TelegramAccessPolicy } from "./contracts"
import { authFailure, authSuccess, type AuthResult } from "./errors"
import { normalizeProfileUpdate } from "./profile"
import { resolveTelegramUserProfile } from "./telegram/profile"
import type { TelegramIdentity } from "./telegram/types"
import type {
  AuthSession,
  ProfileSeed,
  UpdateUserProfileInput,
  User,
} from "./types"

const DEFAULT_AUTH_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export type AuthServiceDependencies = {
  users: UserRepository
  sessions: AuthSessionRepository
  telegramAccess: TelegramAccessPolicy
  tokens: AuthTokenCodec
  clock?: Clock
  sessionTtlMs?: number
}

export class AuthService {
  private readonly clock: Clock
  private readonly sessionTtlMs: number

  constructor(private readonly dependencies: AuthServiceDependencies) {
    this.clock = dependencies.clock ?? { now: () => new Date() }
    this.sessionTtlMs = dependencies.sessionTtlMs ?? DEFAULT_AUTH_SESSION_TTL_MS
  }

  async signInWithTelegram(
    identity: TelegramIdentity,
    profileSeed?: ProfileSeed
  ): Promise<AuthResult<AuthSession>> {
    if (
      !(await this.dependencies.telegramAccess.isAllowed(identity.telegramId))
    ) {
      return authFailure("telegram_user_verification_denied")
    }

    const now = this.clock.now()
    const user = await this.dependencies.users.upsertTelegramUser({
      identity,
      newUserProfile: resolveTelegramUserProfile(identity, profileSeed),
      now,
    })

    const session = await this.createSession(user, now)

    return authSuccess<AuthSession>(session)
  }

  async authenticate(token: string): Promise<AuthResult<AuthSession> | null> {
    const tokenHash = this.dependencies.tokens.hash(token)
    const now = this.clock.now()
    const session = await this.dependencies.sessions.findActiveByTokenHash(
      tokenHash,
      now
    )

    if (!session) {
      return null
    }

    const user = await this.dependencies.users.findById(session.userId)

    if (!user) {
      await this.dependencies.sessions.deleteByTokenHash(tokenHash)
      return null
    }

    if (
      !isDevelopmentIdentity(user.telegramId) &&
      !(await this.dependencies.telegramAccess.isAllowed(user.telegramId))
    ) {
      await this.dependencies.sessions.deleteByTokenHash(tokenHash)
      return null
    }

    await this.dependencies.sessions.touch(tokenHash, now)

    return authSuccess<AuthSession>({
      token,
      user,
      expiresAt: session.expiresAt.toISOString(),
    })
  }

  async revokeSession(token: string): Promise<void> {
    await this.dependencies.sessions.deleteByTokenHash(
      this.dependencies.tokens.hash(token)
    )
  }

  async updateProfile(
    userId: string,
    input: UpdateUserProfileInput
  ): Promise<AuthResult<User>> {
    const user = await this.dependencies.users.updateProfile(
      userId,
      normalizeProfileUpdate(input),
      this.clock.now()
    )

    if (!user) {
      return authFailure("user_not_found")
    }

    return authSuccess<User>(user)
  }

  async signInDevelopmentUser(
    identityId?: string
  ): Promise<AuthResult<AuthSession>> {
    const now = this.clock.now()
    const telegramId = identityId?.trim() || `dev_${crypto.randomUUID()}`
    const identity: TelegramIdentity = {
      telegramId,
      firstName: "Dev",
    }
    const user = await this.dependencies.users.upsertTelegramUser({
      identity,
      newUserProfile: {
        displayName: "Dev User",
        color: "#3b82f6",
      },
      now,
    })

    const session = await this.createSession(user, now)

    return authSuccess(session)
  }

  private async createSession(user: User, now: Date): Promise<AuthSession> {
    const token = this.dependencies.tokens.create()
    const expiresAt = new Date(now.getTime() + this.sessionTtlMs)

    await this.dependencies.sessions.create({
      tokenHash: this.dependencies.tokens.hash(token),
      userId: user.id,
      createdAt: now,
      expiresAt,
    })

    return {
      token,
      user,
      expiresAt: expiresAt.toISOString(),
    }
  }
}

function isDevelopmentIdentity(telegramId: string): boolean {
  return telegramId.startsWith("dev_")
}
