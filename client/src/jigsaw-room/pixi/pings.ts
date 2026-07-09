import type { Application } from "pixi.js"
import {
  CanvasSource,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
} from "pixi.js"

import type { CameraController } from "./camera"

const PING_DURATION_MS = 1050
const PING_COOLDOWN_MS = 500
const PING_SOUND_COOLDOWN_MS = 250

const PING_MAX_RADIUS = 24
const PING_MASK_TEXTURE_SIZE = PING_MAX_RADIUS * 2

const STATIC_RING_ALPHA = 0.2
const EXPANDING_RING_ALPHA = 0.95
const CENTER_DISC_ALPHA = 0.32
const CORE_DISC_ALPHA = 0.52

const PING_SOUND_VOLUME = 0.05
const INDICATOR_SIZE = 8
const EDGE_PADDING = 30
const ONSCREEN_MARGIN = 28
const TEXT_STROKE = { color: 0x000000, width: 2, join: "round" } as const

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

interface TimelinePoint {
  at: number
  value: number
}

function timeline(elapsedMs: number, points: TimelinePoint[]): number {
  if (points.length === 0) return 0
  if (elapsedMs <= points[0].at) return points[0].value

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const next = points[i]

    if (elapsedMs <= next.at) {
      const t = clamp01((elapsedMs - prev.at) / (next.at - prev.at))
      return lerp(prev.value, next.value, easeOutCubic(t))
    }
  }

  return points[points.length - 1].value
}

interface PingView {
  container: Container
  staticOuterRing: Sprite
  expandingRing: Sprite
  innerGlow: Sprite
  coreGlow: Sprite
  exclamationMark: Sprite
  label: Text
  indicator: Container | null
  indicatorIcon: Graphics | null
  startedAt: number
  x: number
  y: number
  color: number
  lightColor: number
}

interface PingTextures {
  staticOuterRing: Texture
  expandingRing: Texture
  innerGlow: Texture
  coreGlow: Texture
  exclamationMark: Texture
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
let pingTextures: PingTextures | null = null

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
    if (ctx.state === "suspended") await ctx.resume()

    ensurePingGain(ctx)

    const response = await fetch("/assets/Ui_ping.mp3")
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
    if (ctx.state === "suspended") await ctx.resume()

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
  const textures = getPingTextures()

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
    if (now - lastPingAt < PING_COOLDOWN_MS) return

    lastPingAtByUser.set(userId, now)
    await loadPingSound()

    const rawColor = colorToNumber(userColor) ?? 0xffffff
    const color = getDisplayPingColor(rawColor)
    const lightColor = mixColor(color, 0xffffff, 0.18)

    const container = new Container({ label: `ping-${userName}` })
    const staticOuterRing = createPingSprite(textures.staticOuterRing, color)
    const expandingRing = createPingSprite(textures.expandingRing, color)
    const innerGlow = createPingSprite(textures.innerGlow, color)
    const coreGlow = createPingSprite(textures.coreGlow, color)
    const exclamationMark = createPingSprite(textures.exclamationMark, color)
    const label = new Text({
      text: userName,
      resolution: app.renderer.resolution,
      style: {
        fill: lightColor,
        fontFamily: "Satoshi Variable, system-ui, sans-serif",
        fontSize: 12,
        fontWeight: "700",
        stroke: TEXT_STROKE,
      },
    })

    label.position.set(14, -8)

    staticOuterRing.alpha = STATIC_RING_ALPHA
    expandingRing.alpha = EXPANDING_RING_ALPHA
    innerGlow.alpha = CENTER_DISC_ALPHA
    coreGlow.alpha = CORE_DISC_ALPHA
    exclamationMark.alpha = 1
    label.alpha = 1

    container.addChild(
      innerGlow,
      coreGlow,
      staticOuterRing,
      expandingRing,
      exclamationMark,
      label
    )
    container.position.set(x, y)
    container.eventMode = "none"

    pings.push({
      container,
      staticOuterRing,
      expandingRing,
      innerGlow,
      coreGlow,
      exclamationMark,
      label,
      indicator: null,
      indicatorIcon: null,
      startedAt: performance.now(),
      x,
      y,
      color,
      lightColor,
    })

    pingLayer.addChild(container)
    await playPingSound()
  }

  loadPingSound()

  function ensureIndicator(ping: PingView): void {
    if (ping.indicator) return

    const container = new Container({ label: "ping-indicator" })
    const icon = new Graphics()

    container.addChild(icon)
    container.eventMode = "none"
    indicatorLayer.addChild(container)

    ping.indicator = container
    ping.indicatorIcon = icon
  }

  function updatePings(): void {
    if (pings.length === 0) return

    const now = performance.now()
    const baseRes = app.renderer.resolution
    const cw = app.canvas.clientWidth
    const ch = app.canvas.clientHeight
    const centerX = cw / 2
    const centerY = ch / 2

    for (let i = pings.length - 1; i >= 0; i--) {
      const ping = pings[i]
      const elapsed = now - ping.startedAt
      updatePingVisuals(ping, elapsed)

      const textRes = Math.min(Math.round(baseRes * camera.zoom), baseRes * 4)
      if (ping.label.resolution !== textRes) {
        ping.label.resolution = textRes
      }

      const indicatorAlpha = timeline(elapsed, [
        { at: 0, value: 0 },
        { at: 70, value: 1 },
        { at: 850, value: 1 },
        { at: PING_DURATION_MS, value: 0 },
      ])

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
          ping.indicatorIcon = null
        }
        continue
      }

      ensureIndicator(ping)
      const indicator = ping.indicator
      const icon = ping.indicatorIcon

      if (!indicator || !icon) continue

      const dx = screen.x - centerX
      const dy = screen.y - centerY
      const angle = Math.atan2(dy, dx)

      const absCos = Math.abs(Math.cos(angle))
      const absSin = Math.abs(Math.sin(angle))

      const scaleX = (centerX - EDGE_PADDING) / (absCos === 0 ? 0.001 : absCos)
      const scaleY = (centerY - EDGE_PADDING) / (absSin === 0 ? 0.001 : absSin)
      const scale = Math.min(scaleX, scaleY)

      const ix = centerX + Math.cos(angle) * scale
      const iy = centerY + Math.sin(angle) * scale

      const s = INDICATOR_SIZE
      icon.clear()
      icon
        .moveTo(-s * 0.6, -s)
        .lineTo(s, 0)
        .lineTo(-s * 0.6, s)
        .closePath()
        .fill({
          color: ping.lightColor,
          alpha: Math.min(indicatorAlpha * 1.1, 1),
        })
        .stroke({
          width: 1.5,
          color: 0x000000,
          alpha: Math.min(indicatorAlpha * 0.85, 1),
        })

      icon.rotation = angle
      indicator.position.set(ix, iy)
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

function createPingSprite(texture: Texture, tint: number): Sprite {
  const sprite = new Sprite(texture)
  sprite.anchor.set(0.5)
  sprite.tint = tint
  sprite.roundPixels = false
  return sprite
}

function getPingTextures(): PingTextures {
  if (pingTextures) return pingTextures

  pingTextures = {
    staticOuterRing: createHudRingTexture(),
    expandingRing: createSharpHudRingTexture(),
    innerGlow: createSubtleCoreTexture(),
    coreGlow: createSubtleCoreTexture(),
    exclamationMark: createHudExclamationTexture(),
  }

  return pingTextures
}

function createHudRingTexture(): Texture {
  return createCanvasTexture(PING_MASK_TEXTURE_SIZE, (ctx, size) => {
    const center = size / 2
    const radius = size * 0.44

    ctx.lineCap = "butt"
    ctx.lineJoin = "round"

    // main ring
    ctx.beginPath()
    ctx.arc(center, center, radius, 0, Math.PI * 2)
    ctx.strokeStyle = "rgba(255,255,255,0.9)"
    ctx.lineWidth = 2.25
    ctx.stroke()

    // second inside ring
    ctx.beginPath()
    ctx.arc(center, center, radius - 5, 0, Math.PI * 2)
    ctx.strokeStyle = "rgba(255,255,255,0.32)"
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.strokeStyle = "rgba(255,255,255,0.6)"
    ctx.lineWidth = 2
    ctx.lineCap = "butt"

    const r = radius + 1
    const len = 8

    // top
    ctx.beginPath()
    ctx.moveTo(center - len / 2, center - r)
    ctx.lineTo(center + len / 2, center - r)
    ctx.stroke()

    // right
    ctx.beginPath()
    ctx.moveTo(center + r, center - len / 2)
    ctx.lineTo(center + r, center + len / 2)
    ctx.stroke()

    // bottom
    ctx.beginPath()
    ctx.moveTo(center - len / 2, center + r)
    ctx.lineTo(center + len / 2, center + r)
    ctx.stroke()

    // left
    ctx.beginPath()
    ctx.moveTo(center - r, center - len / 2)
    ctx.lineTo(center - r, center + len / 2)
    ctx.stroke()
  })
}

function createSharpHudRingTexture(): Texture {
  return createCanvasTexture(PING_MASK_TEXTURE_SIZE, (ctx, size) => {
    const center = size / 2
    const radius = size * 0.445

    ctx.lineCap = "butt"
    ctx.lineJoin = "round"
    ctx.strokeStyle = "rgba(255,255,255,1)"
    ctx.lineWidth = 3

    ctx.beginPath()
    ctx.arc(center, center, radius, 0, Math.PI * 2)
    ctx.stroke()
  })
}

function createSubtleCoreTexture(): Texture {
  return createCanvasTexture(PING_MASK_TEXTURE_SIZE, (ctx, size) => {
    const center = size / 2
    const radius = size * 0.22

    const gradient = ctx.createRadialGradient(
      center,
      center,
      0,
      center,
      center,
      radius * 1.6
    )
    gradient.addColorStop(0, "rgba(255,255,255,0.65)")
    gradient.addColorStop(0.6, "rgba(255,255,255,0.18)")
    gradient.addColorStop(1, "rgba(255,255,255,0)")

    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
  })
}

function createHudExclamationTexture(): Texture {
  return createCanvasTexture(52, (ctx, size) => {
    const center = size / 2
    const w = 6.5
    const h = 22
    const y = 11

    ctx.lineJoin = "miter"
    ctx.lineCap = "butt"
    ctx.strokeStyle = "rgba(0,0,0,0.95)"
    ctx.fillStyle = "rgba(255,255,255,1)"
    ctx.lineWidth = 1.5

    // vertical line
    ctx.beginPath()
    ctx.rect(center - w / 2, y, w, h)
    ctx.fill()
    ctx.stroke()

    // dot
    ctx.beginPath()
    ctx.arc(center, y + h + 9, 3.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  })
}

function updatePingVisuals(ping: PingView, elapsed: number): void {
  const staticAlpha = timeline(elapsed, [
    { at: 0, value: 0.65 },
    { at: 520, value: 0.55 },
    { at: 1050, value: 0.12 },
  ])
  ping.staticOuterRing.scale.set(1)
  ping.staticOuterRing.alpha = staticAlpha

  // expanding ring
  const expandT = clamp01(elapsed / 420)
  const expandScale = lerp(0.18, 1.08, easeOutCubic(expandT))
  const expandAlpha = timeline(elapsed, [
    { at: 0, value: 0.9 },
    { at: 280, value: 0.75 },
    { at: 620, value: 0 },
  ])

  ping.expandingRing.scale.set(expandScale)
  ping.expandingRing.alpha = expandAlpha

  // core subtle
  const coreAlpha = timeline(elapsed, [
    { at: 0, value: 0.55 },
    { at: 680, value: 0.48 },
    { at: 980, value: 0.08 },
  ])
  ping.innerGlow.scale.set(0.38)
  ping.innerGlow.alpha = coreAlpha * 0.8
  ping.coreGlow.scale.set(0.26)
  ping.coreGlow.alpha = coreAlpha * 0.9

  // exclamation + label
  const markAlpha = timeline(elapsed, [
    { at: 0, value: 1 },
    { at: 920, value: 1 },
    { at: PING_DURATION_MS, value: 0.1 },
  ])
  ping.exclamationMark.scale.set(0.65)
  ping.exclamationMark.alpha = markAlpha
  ping.label.alpha = markAlpha
}

function createCanvasTexture(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, size: number) => void
): Texture {
  const resolution =
    typeof window === "undefined"
      ? 3
      : Math.min(Math.max(window.devicePixelRatio || 1, 3), 4)

  const source = new CanvasSource({
    width: size,
    height: size,
    resolution,
    scaleMode: "linear",
    autoGenerateMipmaps: true,
  })

  const ctx = source.context2D
  ctx.setTransform(resolution, 0, 0, resolution, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.clearRect(0, 0, size, size)

  draw(ctx, size)

  source.update()

  return new Texture({ source })
}

function colorToNumber(color: string): number | null {
  const normalized = color.trim().replace(/^#/, "")
  return /^[0-9a-f]{6}$/i.test(normalized)
    ? Number.parseInt(normalized, 16)
    : null
}

function getDisplayPingColor(color: number): number {
  const hsl = rgbToHsl(numberToRgb(color))

  if (hsl.l < 0.38) hsl.l = 0.5
  if (hsl.s < 0.42) hsl.s = 0.58
  if (hsl.l > 0.88) hsl.l = 0.8

  return rgbToNumber(hslToRgb(hsl))
}

interface Rgb {
  r: number
  g: number
  b: number
}

interface Hsl {
  h: number
  s: number
  l: number
}

function numberToRgb(color: number): Rgb {
  return {
    r: (color >> 16) & 0xff,
    g: (color >> 8) & 0xff,
    b: color & 0xff,
  }
}

function rgbToNumber({ r, g, b }: Rgb): number {
  return (r << 16) + (g << 8) + b
}

function mixColor(from: number, to: number, amount: number): number {
  const a = numberToRgb(from)
  const b = numberToRgb(to)
  const t = clamp01(amount)

  return rgbToNumber({
    r: Math.round(lerp(a.r, b.r, t)),
    g: Math.round(lerp(a.g, b.g, t)),
    b: Math.round(lerp(a.b, b.b, t)),
  })
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255

  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0)
        break
      case gn:
        h = (bn - rn) / d + 2
        break
      default:
        h = (rn - gn) / d + 4
        break
    }

    h /= 6
  }

  return { h, s, l }
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  if (s === 0) {
    const value = Math.round(l * 255)
    return { r: value, g: value, b: value }
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q

  return {
    r: Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hueToRgb(p, q, h) * 255),
    b: Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
  }
}

function hueToRgb(p: number, q: number, t: number): number {
  let normalized = t

  if (normalized < 0) normalized += 1
  if (normalized > 1) normalized -= 1

  if (normalized < 1 / 6) return p + (q - p) * 6 * normalized
  if (normalized < 1 / 2) return q
  if (normalized < 2 / 3) return p + (q - p) * (2 / 3 - normalized) * 6

  return p
}
