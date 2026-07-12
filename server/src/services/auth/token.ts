import { SHA256 } from "bun"
import { randomBytes } from "crypto"

export function readAuthToken(request: Request): string | null {
  const authorization = request.headers.get("authorization")

  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return null
  }

  return authorization.slice("bearer ".length).trim() || null
}

export function createAuthToken(): string {
  return randomBytes(32).toString("base64url")
}

export function hashAuthToken(token: string): string {
  return SHA256.hash(token, "hex")
}
