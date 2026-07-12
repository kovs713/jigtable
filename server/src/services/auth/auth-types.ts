export type TelegramAuthProfile = {
  telegramId: string
  username?: string
  firstName?: string
  lastName?: string
  photoUrl?: string
}

export type AuthenticatedUser = {
  id: string
  telegramId: string
  username: string | null
  firstName: string | null
  lastName: string | null
  photoUrl: string | null
  displayName: string
  color: string
}

export type AuthSessionResult = {
  token: string
  user: AuthenticatedUser
  expiresAt: string
}

export type UserProfileInput = {
  name?: string
  color?: string
}
