export class AuthAccessDeniedError extends Error {
  readonly code = "auth_access_denied"

  constructor(message = "Authentication is not allowed for this user") {
    super(message)
    this.name = "AuthAccessDeniedError"
  }
}

export class UserNotFoundError extends Error {
  readonly code = "user_not_found"

  constructor() {
    super("User not found")
    this.name = "UserNotFoundError"
  }
}
