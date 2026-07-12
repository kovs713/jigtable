const SESSION_KEY_PREFIX = "jigsaw:session:"

export function createSessionId(): string {
  return createId("session")
}

export function createPlayerId(): string {
  return createId("player")
}

export function sessionKey(token: string): string {
  return `${SESSION_KEY_PREFIX}${token}`
}

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`
}
