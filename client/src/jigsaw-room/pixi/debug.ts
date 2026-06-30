import { countPlacedPieces } from "../puzzle/groups"
import type { PuzzleState, PuzzleStats } from "../puzzle/types"
import type { CameraController } from "./camera"
import type { Application, Ticker } from "pixi.js"

export interface DebugTicker {
  destroy: () => void
}

export function getPuzzleStats(
  state: PuzzleState,
  fps: number,
  zoom: number,
): PuzzleStats {
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
  state: PuzzleState,
  camera: CameraController,
  onStats: (stats: PuzzleStats) => void,
): DebugTicker {
  let elapsed = 0

  const emit = (): void => {
    onStats(getPuzzleStats(state, app.ticker.FPS || 0, camera.zoom))
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
