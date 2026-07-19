export type AuthResult<T> = AuthSuccess<T> | AuthFailure

export type AuthSuccess<T> = {
  ok: true
  value: T
}

export function authSuccess<T>(value: T): AuthSuccess<T> {
  return {
    ok: true,
    value,
  }
}

export type AuthFailureCode =
  "telegram_user_verification_denied" | "auth_access_denied" | "user_not_found"

export type AuthFailure = {
  ok: false
  code: AuthFailureCode
}

export function authFailure(code: AuthFailureCode): AuthFailure {
  return {
    ok: false,
    code,
  }
}
