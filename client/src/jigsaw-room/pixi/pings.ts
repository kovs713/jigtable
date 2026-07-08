import { Container, Graphics, Text } from "pixi.js"
import type { Application } from "pixi.js"
import type { CameraController } from "./camera"

const PING_DURATION_MS = 1500
const PING_COOLDOWN_MS = 500
const PING_SOUND_COOLDOWN_MS = 250

const PING_MAX_RADIUS = 42
const PING_START_RADIUS = 6
const PING_DOT_RADIUS = 4

const PING_SOUND_VOLUME = 0.18
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
  ) => Promise<void>
  destroy: () => void
}

type AudioContextConstructor = new () => AudioContext

type AudioWindow = Window & {
  AudioContext?: AudioContextConstructor
  webkitAudioContext?: AudioContextConstructor
}

let audioContext: AudioContext | null = null
let audioBuffer: AudioBuffer | null = null
let pingGain: GainNode | null = null
let isAudioReady = false
let lastPingSoundAt = 0

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null
  if (audioContext) return audioContext

  const audioWindow = window as AudioWindow
  const AudioContextCtor =
    audioWindow.AudioContext ?? audioWindow.webkitAudioContext

  if (!AudioContextCtor) return null

  audioContext = new AudioContextCtor()
  return audioContext
}

function ensurePingGain(ctx: AudioContext): GainNode {
  if (!pingGain) {
    pingGain = ctx.createGain()
    pingGain.gain.value = PING_SOUND_VOLUME
    pingGain.connect(ctx.destination)
  }

  return pingGain
}

async function loadPingSound(): Promise<void> {
  if (isAudioReady) return

  try {
    const ctx = getAudioContext()
    if (!ctx) return

    if (ctx.state === "suspended") {
      await ctx.resume()
    }

    ensurePingGain(ctx)

    const response = await fetch("/Ui_ping.mp3")
    const arrayBuffer = await response.arrayBuffer()
    audioBuffer = await ctx.decodeAudioData(arrayBuffer)
    isAudioReady = true
  } catch (error) {
    console.error("Failed to load ping sound:", error)
  }
}

async function playPingSound(): Promise<void> {
  if (!isAudioReady || !audioBuffer) return

  const now = performance.now()
  if (now - lastPingSoundAt < PING_SOUND_COOLDOWN_MS) return
  lastPingSoundAt = now

  try {
    const ctx = getAudioContext()
    if (!ctx) return

    if (ctx.state === "suspended") {
      await ctx.resume()
    }

    const gain = ensurePingGain(ctx)

    const source = ctx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(gain)
    source.start(0)
  } catch (error) {
    console.error("Failed to play ping sound:", error)
  }
}

export function createPingController(
  app: Application,
  layer: Container,
  camera: CameraController
): PingController {
  const pingLayer = new Container({ label: "jigsaw-ping-layer" })
  const indicatorLayer = new Container({ label: "jigsaw-ping-indicators" })
  const pings: PingView[] = []
  const lastPingAtByUser = new Map<string, number>()

  pingLayer.eventMode = "none"
  indicatorLayer.eventMode = "none"
  layer.addChild(pingLayer)
  app.stage.addChild(indicatorLayer)

  async function showPing(
    x: number,
    y: number,
    userId: string,
    userName: string,
    userColor: string
  ): Promise<void> {
    const now = performance.now()
    const lastPingAt = lastPingAtByUser.get(userId) ?? 0

    if (now - lastPingAt < PING_COOLDOWN_MS) {
      return
    }

    lastPingAtByUser.set(userId, now)

    await loadPingSound()

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

    await playPingSound()
  }

  loadPingSound()

  async function ensureIndicator(ping: PingView, name: string): Promise<void> {
    if (ping.indicator) return Promise.resolve()

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

      lastPingAtByUser.clear()

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
