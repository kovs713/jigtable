import type { Router } from "../types"

export function registerHealthRoutes(router: Router): void {
  router.get("/api/health", {
    handler: () => Response.json({ ok: true }),
  })
}
