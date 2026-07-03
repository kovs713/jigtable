import { readOptionalOriginEnv, readOriginEnv } from "@/infra/env"

const corsOrigin = readOptionalOriginEnv("CORS_ORIGIN") ?? readOriginEnv("CLIENT_URL")

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": corsOrigin,
  "Access-Control-Allow-Headers": "authorization,content-type",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
  Vary: "Origin",
}
