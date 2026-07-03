import type { Application, Ticker } from "pixi.js"

import { countPlacedPieces } from "@jigtable/jigsaw-core/jigsaw/groups"
import type {
  JigsawState,
  JigsawStats,
} from "@jigtable/jigsaw-core/jigsaw/types"
import type { CameraController } from "./camera"

export interface DebugTicker {
  destroy: () => void
}

export function getJigsawStats(
  state: JigsawState,
  fps: number,
  zoom: number
): JigsawStats {
  return {
    fps,
    zoom,
    totalPieces: Object.keys(state.pieces).length,
    placedPieces: countPlacedPieces(state),
    groupsCount: Object.keys(state.groups).length,
    snapCount: state.snapCount,
  }
}

export function createDebugTicker(
  app: Application,
  state: JigsawState,
  camera: CameraController,
  onStats: (stats: JigsawStats) => void
): DebugTicker {
  let elapsed = 0

  const emit = (): void => {
    onStats(getJigsawStats(state, app.ticker.FPS || 0, camera.zoom))
  }

  const onTick = (ticker: Ticker): void => {
    elapsed += ticker.elapsedMS

    if (elapsed < 220) {
      return
    }

    elapsed = 0
    emit()
  }

  emit()
  app.ticker.add(onTick)

  return {
    destroy() {
      app.ticker.remove(onTick)
    },
  }
}
