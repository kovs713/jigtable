import { Application } from "pixi.js"

export async function createJigsawPixiApp(host: HTMLElement): Promise<Application> {
  const app = new Application()

  await app.init({
    resizeTo: host,
    backgroundAlpha: 0,
    antialias: false,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    eventFeatures: {
      move: false,
      globalMove: false,
      click: false,
      wheel: false,
    },
  })

  const canvas = app.canvas as HTMLCanvasElement
  canvas.className = "jigsaw-room__canvas"
  canvas.addEventListener("contextmenu", preventContextMenu)
  host.appendChild(canvas)

  return app
}

export function destroyJigsawPixiApp(app: Application): void {
  ;(app.canvas as HTMLCanvasElement).removeEventListener("contextmenu", preventContextMenu)
  app.destroy({ removeView: true, releaseGlobalResources: true }, { children: true })
}

function preventContextMenu(event: MouseEvent): void {
  event.preventDefault()
}
