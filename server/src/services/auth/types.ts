export type User = {
  id: string
  telegramId: string
  username: string | null
  firstName: string | null
  lastName: string | null
  photoUrl: string | null
  displayName: string
  color: string
}

export type AuthSession = {
  token: string
  user: User
  expiresAt: string
}

export type ProfileSeed = {
  displayName?: string
  color?: string
}

export type UpdateUserProfileInput = {
  displayName?: string
  color?: string
}
