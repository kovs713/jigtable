import type {
  AuthSessionRepository,
  AuthTokenCodec,
  Clock,
  TelegramAccessPolicy,
  UserRepository,
} from "./contracts"
import { AuthAccessDeniedError, UserNotFoundError } from "./errors"
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
  ): Promise<AuthSession> {
    if (
      !(await this.dependencies.telegramAccess.isAllowed(identity.telegramId))
    ) {
      throw new AuthAccessDeniedError("Telegram user is not whitelisted")
    }

    const now = this.clock.now()
    const user = await this.dependencies.users.upsertTelegramUser({
      identity,
      newUserProfile: resolveTelegramUserProfile(identity, profileSeed),
      now,
    })

    return this.issueSession(user, now)
  }

  async authenticate(token: string): Promise<AuthSession | null> {
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

    return {
      token,
      user,
      expiresAt: session.expiresAt.toISOString(),
    }
  }

  async revokeSession(token: string): Promise<void> {
    await this.dependencies.sessions.deleteByTokenHash(
      this.dependencies.tokens.hash(token)
    )
  }

  async updateProfile(
    userId: string,
    input: UpdateUserProfileInput
  ): Promise<User> {
    const user = await this.dependencies.users.updateProfile(
      userId,
      normalizeProfileUpdate(input),
      this.clock.now()
    )

    if (!user) {
      throw new UserNotFoundError()
    }

    return user
  }

  async signInDevelopmentUser(identityId?: string): Promise<AuthSession> {
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

    return this.issueSession(user, now)
  }

  private async issueSession(user: User, now: Date): Promise<AuthSession> {
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
