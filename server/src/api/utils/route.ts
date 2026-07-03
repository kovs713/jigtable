import type { BunRequest } from "bun"

import { toApiError } from "../types"
import { json } from "./json"

export type RouteHandler = (request: BunRequest) => Promise<Response> | Response

export function route(handler: RouteHandler): RouteHandler {
  return async (request) => {
    try {
      return await handler(request)
    } catch (error) {
      const apiError = toApiError(error)
      return json(apiError.body, apiError.status)
    }
  }
}
