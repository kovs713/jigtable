import { Container, Graphics, Text } from "pixi.js"
import type { Application } from "pixi.js"
import type { CameraController } from "./camera"

const PING_DURATION_MS = 1500
const PING_MAX_RADIUS = 42
const PING_START_RADIUS = 6
const PING_DOT_RADIUS = 4
const INDICATOR_FONT_SIZE = 21
const INDICATOR_DOT_RADIUS = 7
const EDGE_PADDING = 18
const ONSCREEN_MARGIN = 28
const TEXT_STROKE = { color: 0x0a1018, width: 3, join: "round" } as const

interface PingView {
  container: Container
  wave: Graphics
  dot: Graphics
  label: Text
  indicator: Container | null
  indicatorLabel: Text | null
  startedAt: number
  x: number
  y: number
  color: number
}

export interface PingController {
  showPing: (
    x: number,
    y: number,
    userId: string,
    userName: string,
    userColor: string
  ) => void
  destroy: () => void
}

export function createPingController(
  app: Application,
  layer: Container,
  camera: CameraController
): PingController {
  const pingLayer = new Container({ label: "jigsaw-ping-layer" })
  const indicatorLayer = new Container({ label: "jigsaw-ping-indicators" })
  const pings: PingView[] = []

  pingLayer.eventMode = "none"
  indicatorLayer.eventMode = "none"
  layer.addChild(pingLayer)
  app.stage.addChild(indicatorLayer)

  function showPing(
    x: number,
    y: number,
    _userId: string,
    userName: string,
    userColor: string
  ): void {
    const color = colorToNumber(userColor) ?? 0xffffff
    const container = new Container()
    const wave = new Graphics()
    const dot = new Graphics()
    const label = new Text({
      text: userName,
      resolution: app.renderer.resolution,
      style: {
        fill: color,
        fontFamily: "Satoshi Variable, system-ui, sans-serif",
        fontSize: 12,
        fontWeight: "700",
        stroke: TEXT_STROKE,
      },
    })

    label.position.set(PING_DOT_RADIUS + 10, -7)
    container.addChild(wave, dot, label)
    container.position.set(x, y)
    container.eventMode = "none"

    const view: PingView = {
      container,
      wave,
      dot,
      label,
      indicator: null,
      indicatorLabel: null,
      startedAt: performance.now(),
      x,
      y,
      color,
    }

    pings.push(view)
    pingLayer.addChild(container)
  }

  function ensureIndicator(ping: PingView, name: string): void {
    if (ping.indicator) return

    const container = new Container({ label: "ping-indicator" })
    const dot = new Graphics()
    const label = new Text({
      text: name,
      resolution: app.renderer.resolution,
      style: {
        fill: ping.color,
        fontFamily: "Satoshi Variable, system-ui, sans-serif",
        fontSize: INDICATOR_FONT_SIZE,
        fontWeight: "700",
        stroke: TEXT_STROKE,
      },
    })

    container.addChild(dot, label)
    container.eventMode = "none"
    indicatorLayer.addChild(container)

    ping.indicator = container
    ping.indicatorLabel = label
  }

  function updatePings(): void {
    if (pings.length === 0) return

    const now = performance.now()
    const baseRes = app.renderer.resolution
    const cw = app.canvas.clientWidth
    const ch = app.canvas.clientHeight

    for (let i = pings.length - 1; i >= 0; i--) {
      const ping = pings[i]
      const elapsed = now - ping.startedAt
      const t = Math.min(elapsed / PING_DURATION_MS, 1)
      const radius =
        PING_START_RADIUS + (PING_MAX_RADIUS - PING_START_RADIUS) * t
      const alpha = 1 - t

      ping.wave
        .clear()
        .circle(0, 0, radius)
        .stroke({ width: 2, color: ping.color, alpha })

      ping.dot
        .clear()
        .circle(0, 0, PING_DOT_RADIUS)
        .fill({ color: ping.color, alpha: Math.min(alpha * 1.4, 1) })

      const textRes = Math.min(Math.round(baseRes * camera.zoom), baseRes * 4)
      if (ping.label.resolution !== textRes) {
        ping.label.resolution = textRes
      }

      ping.label.alpha = alpha

      const screen = camera.worldToScreen(ping.x, ping.y)
      const onScreen =
        screen.x >= ONSCREEN_MARGIN &&
        screen.x <= cw - ONSCREEN_MARGIN &&
        screen.y >= ONSCREEN_MARGIN &&
        screen.y <= ch - ONSCREEN_MARGIN

      if (onScreen) {
        if (ping.indicator) {
          ping.indicator.destroy({ children: true })
          ping.indicator = null
          ping.indicatorLabel = null
        }
        continue
      }

      const name = ping.label.text
      ensureIndicator(ping, name)

      const cx = Math.max(EDGE_PADDING, Math.min(cw - EDGE_PADDING, screen.x))
      const cy = Math.max(EDGE_PADDING, Math.min(ch - EDGE_PADDING, screen.y))
      const indicator = ping.indicator

      if (!indicator) continue

      const labelRight = screen.x < cw / 2
      const dot = indicator.children[0] as Graphics

      dot
        .clear()
        .rect(
          -INDICATOR_DOT_RADIUS,
          -INDICATOR_DOT_RADIUS,
          INDICATOR_DOT_RADIUS * 2,
          INDICATOR_DOT_RADIUS * 2
        )
        .fill({ color: ping.color, alpha: Math.min(alpha * 1.4, 1) })

      const label = ping.indicatorLabel

      if (label) {
        label.alpha = alpha
        label.position.set(labelRight ? INDICATOR_DOT_RADIUS + 10 : 0, -8)
      }

      indicator.position.set(cx, cy)
    }

    for (let i = pings.length - 1; i >= 0; i--) {
      if (pings[i].startedAt + PING_DURATION_MS <= now) {
        pings[i].container.destroy({ children: true })
        pings[i].indicator?.destroy({ children: true })
        pings.splice(i, 1)
      }
    }
  }

  app.ticker.add(updatePings)

  return {
    showPing,
    destroy() {
      app.ticker.remove(updatePings)

      for (const ping of pings) {
        ping.container.destroy({ children: true })
        ping.indicator?.destroy({ children: true })
      }

      pings.length = 0
      pingLayer.destroy({ children: true })
      indicatorLayer.destroy({ children: true })
    },
  }
}

function colorToNumber(color: string): number | null {
  const normalized = color.trim().replace(/^#/, "")
  return /^[0-9a-f]{6}$/i.test(normalized)
    ? Number.parseInt(normalized, 16)
    : null
}
