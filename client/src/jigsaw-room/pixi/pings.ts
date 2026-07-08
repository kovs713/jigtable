import type { Application } from "pixi.js"
import { Container, Graphics, Sprite, Text, Texture } from "pixi.js"

import type { CameraController } from "./camera"

const PING_DURATION_MS = 1050
const PING_COOLDOWN_MS = 500
const PING_SOUND_COOLDOWN_MS = 250

const PING_MAX_RADIUS = 64
const PING_MASK_TEXTURE_SIZE = PING_MAX_RADIUS * 2

const STATIC_RING_SCALE = 1
const EXPANDING_RING_START_SCALE = 0.14
const EXPANDING_RING_END_SCALE = 1
const INNER_GLOW_BASE_SCALE = 0.44
const CORE_GLOW_BASE_SCALE = 0.31
const MARK_BASE_SCALE = 1

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

function updatePingVisuals(ping: PingView, elapsed: number): void {
  // Static outer ring: большой мутный ринг уже стоит на максимальном радиусе.
  // Он не расширяется, только держится слабым фоном и тухнет в конце.
  const staticRingAlpha = timeline(elapsed, [
    { at: 0, value: STATIC_RING_ALPHA },
    { at: 800, value: STATIC_RING_ALPHA },
    { at: 980, value: 0.08 },
    { at: PING_DURATION_MS, value: 0 },
  ])

  ping.staticOuterRing.scale.set(STATIC_RING_SCALE)
  ping.staticOuterRing.alpha = staticRingAlpha

  // Expanding ring: единственный активный круг, четкий и чуть жирнее static ring.
  const expandingRingT = clamp01(elapsed / 520)
  const expandingRingScale = lerp(
    EXPANDING_RING_START_SCALE,
    EXPANDING_RING_END_SCALE,
    easeOutCubic(expandingRingT)
  )
  const expandingRingAlpha = timeline(elapsed, [
    { at: 0, value: EXPANDING_RING_ALPHA },
    { at: 380, value: 0.9 },
    { at: 620, value: 0.72 },
    { at: 760, value: 0 },
    { at: PING_DURATION_MS, value: 0 },
  ])

  ping.expandingRing.scale.set(expandingRingScale)
  ping.expandingRing.alpha = expandingRingAlpha

  // Center disc: небольшое плотное пятно под знаком, почти без радиального движения.
  const innerAlpha = timeline(elapsed, [
    { at: 0, value: CENTER_DISC_ALPHA },
    { at: 760, value: CENTER_DISC_ALPHA },
    { at: 960, value: 0.1 },
    { at: PING_DURATION_MS, value: 0 },
  ])

  ping.innerGlow.scale.set(INNER_GLOW_BASE_SCALE)
  ping.innerGlow.alpha = innerAlpha

  const coreAlpha = timeline(elapsed, [
    { at: 0, value: CORE_DISC_ALPHA },
    { at: 740, value: CORE_DISC_ALPHA },
    { at: 940, value: 0.18 },
    { at: PING_DURATION_MS, value: 0 },
  ])

  ping.coreGlow.scale.set(CORE_GLOW_BASE_SCALE)
  ping.coreGlow.alpha = coreAlpha

  // Exclamation mark: четкий, без блюра и без fade-in. Тухнет только в конце.
  ping.exclamationMark.scale.set(MARK_BASE_SCALE)
  ping.exclamationMark.alpha = timeline(elapsed, [
    { at: 0, value: 1 },
    { at: 900, value: 1 },
    { at: PING_DURATION_MS, value: 0 },
  ])

  const labelAlpha = timeline(elapsed, [
    { at: 0, value: 1 },
    { at: 900, value: 1 },
    { at: PING_DURATION_MS, value: 0 },
  ])

  ping.label.alpha = labelAlpha
}

function createPingSprite(texture: Texture, tint: number): Sprite {
  const sprite = new Sprite(texture)
  sprite.anchor.set(0.5)
  sprite.tint = tint
  return sprite
}

function getPingTextures(): PingTextures {
  if (pingTextures) return pingTextures

  pingTextures = {
    staticOuterRing: createSoftStaticRingTexture(),
    expandingRing: createSharpRingTexture(),
    innerGlow: createRadialGlowTexture([
      { offset: 0, alpha: 0.72 },
      { offset: 0.38, alpha: 0.46 },
      { offset: 0.72, alpha: 0.12 },
      { offset: 1, alpha: 0 },
    ]),
    coreGlow: createRadialGlowTexture([
      { offset: 0, alpha: 0.9 },
      { offset: 0.5, alpha: 0.52 },
      { offset: 0.82, alpha: 0.1 },
      { offset: 1, alpha: 0 },
    ]),
    exclamationMark: createExclamationMarkTexture(),
  }

  return pingTextures
}

function createSoftStaticRingTexture(): Texture {
  return createCanvasTexture(PING_MASK_TEXTURE_SIZE, (ctx, size) => {
    const center = size / 2
    const radius = size * 0.445

    ctx.lineCap = "round"

    // Мутная внешняя рамка: несколько концентрических stroke-слоев вместо жесткой линии.
    ctx.beginPath()
    ctx.arc(center, center, radius, 0, Math.PI * 2)
    ctx.strokeStyle = "rgba(255,255,255,0.12)"
    ctx.lineWidth = 13
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(center, center, radius, 0, Math.PI * 2)
    ctx.strokeStyle = "rgba(255,255,255,0.24)"
    ctx.lineWidth = 7
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(center, center, radius, 0, Math.PI * 2)
    ctx.strokeStyle = "rgba(255,255,255,0.5)"
    ctx.lineWidth = 3
    ctx.stroke()
  })
}

function createSharpRingTexture(): Texture {
  return createCanvasTexture(PING_MASK_TEXTURE_SIZE, (ctx, size) => {
    const center = size / 2
    const radius = size * 0.445

    ctx.beginPath()
    ctx.arc(center, center, radius, 0, Math.PI * 2)
    ctx.strokeStyle = "rgba(255,255,255,1)"
    ctx.lineWidth = 9
    ctx.stroke()
  })
}

interface RadialStop {
  offset: number
  alpha: number
}

function createRadialGlowTexture(stops: RadialStop[]): Texture {
  return createCanvasTexture(PING_MASK_TEXTURE_SIZE, (ctx, size) => {
    const center = size / 2
    const radius = size / 2

    const gradient = ctx.createRadialGradient(
      center,
      center,
      0,
      center,
      center,
      radius
    )

    for (const stop of stops) {
      gradient.addColorStop(
        stop.offset,
        `rgba(255,255,255,${clamp01(stop.alpha)})`
      )
    }

    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
  })
}

function createExclamationMarkTexture(): Texture {
  return createCanvasTexture(64, (ctx, size) => {
    const center = size / 2
    const barWidth = 9
    const barHeight = 25
    const barX = center - barWidth / 2
    const barY = 13
    const dotRadius = 4.6
    const dotY = 46

    ctx.lineJoin = "round"
    ctx.lineCap = "round"
    ctx.strokeStyle = "rgba(0,0,0,0.98)"
    ctx.lineWidth = 2
    ctx.fillStyle = "rgba(255,255,255,1)"

    drawRoundedRectPath(ctx, barX, barY, barWidth, barHeight, barWidth / 2)
    ctx.fill()
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(center, dotY, dotRadius, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  })
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.min(radius, width / 2, height / 2)

  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function createCanvasTexture(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, size: number) => void
): Texture {
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size

  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("2D canvas context is not available")

  ctx.clearRect(0, 0, size, size)
  draw(ctx, size)

  return Texture.from(canvas)
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
