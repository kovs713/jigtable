import type { Router } from "./types"
import { registerAuthRoutes } from "./route-modules/auth"
import { registerBatchRoutes } from "./route-modules/batches"
import { registerHealthRoutes } from "./route-modules/health"
import { registerJigsawRoutes } from "./route-modules/jigsaw"

export function registerRoutes(router: Router): void {
  registerHealthRoutes(router)
  registerAuthRoutes(router)
  registerJigsawRoutes(router)
  registerBatchRoutes(router)
}
