import type { TelegramAccessPolicy } from "../contracts"

export interface TelegramAccessRepository {
  contains(telegramUserId: number): Promise<boolean>
}

export type WhitelistTelegramAccessPolicyOptions = {
  repository: TelegramAccessRepository
  adminTelegramId?: number
}

export class WhitelistTelegramAccessPolicy implements TelegramAccessPolicy {
  constructor(private readonly options: WhitelistTelegramAccessPolicyOptions) {}

  async isAllowed(telegramId: string): Promise<boolean> {
    const numericId = parseTelegramUserId(telegramId)

    if (numericId === null) {
      return false
    }

    if (numericId === this.options.adminTelegramId) {
      return true
    }

    return this.options.repository.contains(numericId)
  }
}

function parseTelegramUserId(value: string): number | null {
  const id = Number(value)

  return Number.isSafeInteger(id) && id > 0 ? id : null
}
