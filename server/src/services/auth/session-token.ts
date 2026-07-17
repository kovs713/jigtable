import { createHash, randomBytes } from "node:crypto"

import type { AuthTokenCodec } from "./contracts"

export const authTokenCodec: AuthTokenCodec = {
  create(): string {
    return randomBytes(32).toString("base64url")
  },

  hash(token: string): string {
    return createHash("sha256").update(token).digest("hex")
  },
}
