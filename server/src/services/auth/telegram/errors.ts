export type TelegramAuthErrorCode =
  | "missing_hash"
  | "missing_user"
  | "missing_user_id"
  | "invalid_auth_date"
  | "expired"
  | "invalid_signature"

export class TelegramAuthVerificationError extends Error {
  constructor(
    readonly code: TelegramAuthErrorCode,
    message: string
  ) {
    super(message)
    this.name = "TelegramAuthVerificationError"
  }
}
