import type { usersSchema } from "@/db/schemas"
import type { AuthenticatedUser } from "./auth-types"

export function toAuthenticatedUser(
  user: typeof usersSchema.$inferSelect
): AuthenticatedUser {
  return {
    id: user.id,
    telegramId: user.telegramId,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    photoUrl: user.photoUrl,
    displayName: user.displayName,
    color: user.color,
  }
}
