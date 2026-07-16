import type { AuthSession } from "@/services/auth"
import type { StoredPlayerSession } from "@/services/player-session"
import type { Services } from "@/services"
import { ApiError, errorResponse } from "./errors"

export type AuthContext =
  | {
      status: "anonymous"
    }
  | {
      status: "authenticated"
      session: AuthSession
    }

export type JigsawSessionContext =
  | {
      status: "anonymous"
    }
  | {
      status: "authenticated"
      session: StoredPlayerSession
    }

export type Context = {
  request: Request
  params: Record<string, string>
  query: URLSearchParams
  services: Services
  auth: AuthContext | null
  jigsaw: JigsawSessionContext
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

type Route = {
  method: string
  path: string
  pipeline: Handler
}

export function createRouter(options: {
  services: Services
  middleware: Middleware[]
}) {
  const routes: Route[] = []

  function addRoute(method: string, path: string, config: RouteConfig): void {
    if (
      routes.some((route) => route.method === method && route.path === path)
    ) {
      throw new Error(`Duplicate HTTP route: ${method} ${path}`)
    }

    routes.push({
      method,
      path,
      pipeline: compose(config.middleware ?? [], config.handler),
    })
  }

  const dispatch: Handler = async (context: Context) => {
    if (context.request.method === "OPTIONS") {
      return new Response(null, { status: 204 })
    }

    for (const route of routes) {
      if (route.method !== context.request.method) {
        continue
      }

      const params = matchPath(
        route.path,
        new URL(context.request.url).pathname
      )

      if (params) {
        return route.pipeline({ ...context, params })
      }
    }

    return errorResponse("Not found", 404)
  }
  const pipeline = compose(options.middleware, dispatch)

  return {
    get(path: string, config: RouteConfig): void {
      addRoute("GET", path, config)
    },

    post(path: string, config: RouteConfig): void {
      addRoute("POST", path, config)
    },

    patch(path: string, config: RouteConfig): void {
      addRoute("PATCH", path, config)
    },

    fetch(request: Request): Promise<Response> {
      const url = new URL(request.url)

      return pipeline({
        request,
        params: {},
        query: url.searchParams,
        services: options.services,
        auth: null,
        jigsaw: { status: "anonymous" },
      })
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

  for (let index = 0; index < routeParts.length; index++) {
    const routePart = routeParts[index]
    const requestPart = requestParts[index]

    if (!routePart || !requestPart) {
      return null
    }

    if (routePart.startsWith(":")) {
      try {
        params[routePart.slice(1)] = decodeURIComponent(requestPart)
      } catch (cause) {
        throw new ApiError("Invalid path parameter", 400, { cause })
      }

      continue
    }

    if (routePart !== requestPart) {
      return null
    }
  }

  return params
}

export function compose(
  middlewares: Middleware[],
  handler: Handler
): (context: Context) => Promise<Response> {
  return async function pipeline(context: Context): Promise<Response> {
    let index = -1

    async function dispatch(position: number): Promise<Response> {
      if (position <= index) {
        throw new Error("next() called multiple times")
      }

      index = position

      const middleware = middlewares[position]

      return middleware
        ? middleware(context, () => dispatch(position + 1))
        : handler(context)
    }

    return dispatch(0)
  }
}
