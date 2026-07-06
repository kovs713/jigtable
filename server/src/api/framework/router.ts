import type { BunRequest } from "bun"

import { errorResponse } from "../errors"
import type { Services } from "../services"

export type Context = {
  request: BunRequest

  params: Record<string, string>
  query: URLSearchParams
  body: unknown

  services: Services

  auth?: {
    token: string
    userId: string
  }
}

export type Middleware = (
  context: Context,
  next: () => Promise<Response>
) => Promise<Response>

export type Handler = (context: Context) => Promise<Response> | Response

export interface RouteConfig {
  middleware?: Middleware[]
  handler: Handler
}

export type Route = {
  method: string
  path: string
  pipeline: Handler
}

export const createRouter = (options: {
  services: Services
  middleware: Middleware[]
}) => {
  const routes: Route[] = []
  const globalMiddleware = options.middleware

  function addRoute(method: string, path: string, config: RouteConfig) {
    const pipeline = compose(
      [...globalMiddleware, ...(config.middleware ?? [])],
      config.handler
    )

    routes.push({
      method,
      path,
      pipeline,
    })
  }

  return {
    get(path: string, config: RouteConfig) {
      addRoute("GET", path, config)
    },

    post(path: string, config: RouteConfig) {
      addRoute("POST", path, config)
    },

    patch(path: string, config: RouteConfig) {
      addRoute("PATCH", path, config)
    },

    options(path: string, config: RouteConfig) {
      addRoute("OPTIONS", path, config)
    },

    async fetch(request: BunRequest) {
      const url = new URL(request.url)
      const baseContext: Context = {
        request,
        params: {},
        query: url.searchParams,
        body: undefined,
        services: options.services,
      }

      if (request.method === "OPTIONS") {
        return compose(
          globalMiddleware,
          async () => new Response(null, { status: 204 })
        )(baseContext)
      }

      for (const route of routes) {
        if (route.method !== request.method) {
          continue
        }

        const params = matchPath(route.path, url.pathname)

        if (!params) {
          continue
        }

        const context: Context = {
          ...baseContext,
          params,
        }

        return route.pipeline(context)
      }

      return errorResponse("Not found", 404)
    },
  }
}

export type Router = ReturnType<typeof createRouter>

function matchPath(
  routePath: string,
  requestPath: string
): Record<string, string> | null {
  const routeParts = routePath.split("/").filter(Boolean)
  const requestParts = requestPath.split("/").filter(Boolean)

  if (routeParts.length !== requestParts.length) {
    return null
  }

  const params: Record<string, string> = {}

  for (let i = 0; i < routeParts.length; i++) {
    const routePart = routeParts[i]
    const requestPart = requestParts[i]

    if (!routePart || !requestPart) {
      return null
    }

    if (routePart.startsWith(":")) {
      params[routePart.slice(1)] = decodeURIComponent(requestPart)
      continue
    }

    if (routePart !== requestPart) {
      return null
    }
  }

  return params
}

export function compose(middlewares: Middleware[], handler: Handler): Handler {
  return async function pipeline(context: Context) {
    let index = -1

    async function dispatch(i: number): Promise<Response> {
      if (i <= index) {
        throw new Error("next() called multiple times")
      }

      index = i

      const middleware = middlewares[i]

      if (!middleware) {
        return handler(context)
      }

      return middleware(context, () => dispatch(i + 1))
    }

    return dispatch(0)
  }
}

export function auth(): Middleware {
  return async (context: Context, next: () => Promise<Response>) => {
    const header = context.request.headers.get("authorization")

    if (!header) {
      return errorResponse("Unauthorized", 401)
    }

    const token = readBearerToken(header)

    if (!token) {
      return errorResponse("Unauthorized", 401)
    }

    const result = await context.services.auth.getUser(token)

    if (!result) {
      return errorResponse("Unauthorized", 401)
    }

    context.auth = {
      userId: result.id,
      token,
    }

    return next()
  }
}

export function readBearerToken(header: string) {
  const [type, token] = header.split(" ")

  if (type !== "Bearer" || !token) {
    return null
  }

  return token
}
