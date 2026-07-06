import type { Container } from "pixi.js"
import { Rectangle, Sprite, Texture } from "pixi.js"

import type {
  GroupId,
  JigsawState,
  PieceDefinition,
  PieceEdgePoint,
  PieceEdgeShape,
  PieceId,
} from "@jigtable/jigsaw-core/jigsaw/types"

const ATLAS_SIZE = 2048
const MAX_TOTAL_ATLAS_PIXELS = 80_000_000
const HIT_ASSIST_RADIUS = 4
const HIGHLIGHT_SPRITE_ALPHA = 0.9

export interface PieceView {
  id: PieceId
  sprite: Sprite
  highlightSprite: Sprite
  hitPath: Path2D
}

export interface PieceViewSet {
  byId: Map<PieceId, PieceView>
  pickPieceAt: (
    x: number,
    y: number,
    options?: { includeLocked?: boolean }
  ) => PieceId | null
  syncPiece: (pieceId: PieceId) => void
  syncPieces: (pieceIds: PieceId[]) => void
  syncAll: () => void
  setAllHighlighted: (highlighted: boolean) => void
  setHighlightColor: (color: number) => void
  raiseGroup: (groupId: GroupId) => void
  destroy: () => void
}

export function createPieceViews(
  layer: Container,
  state: JigsawState,
  imageTexture: Texture,
  highlightColor: number
): PieceViewSet {
  const byId = new Map<PieceId, PieceView>()
  const hitContext = createHitContext()
  const pieceTextures: Texture[] = []
  const atlasTextures: Texture[] = []
  const definitions = Object.values(state.definitions).sort(
    (a, b) => a.row - b.row || a.col - b.col
  )
  const metrics = createShapeMetrics(state)
  const atlas = createPieceAtlas(
    imageTexture,
    state,
    definitions,
    metrics
  )
  let allHighlighted = false

  atlasTextures.push(...atlas.atlasTextures)

  for (const definition of definitions) {
    const atlasPiece = atlas.byId.get(definition.id)

    if (!atlasPiece) {
      continue
    }

    const pieceTexture = atlasPiece.texture
    const sprite = new Sprite({ texture: pieceTexture, label: definition.id })
    const highlightSprite = new Sprite({ texture: atlasPiece.highlightTexture })

    sprite.eventMode = "none"
    sprite.width = metrics.textureWidth
    sprite.height = metrics.textureHeight
    highlightSprite.eventMode = "none"
    highlightSprite.visible = false
    highlightSprite.width = metrics.textureWidth
    highlightSprite.height = metrics.textureHeight
    highlightSprite.tint = highlightColor

    pieceTextures.push(pieceTexture)
    pieceTextures.push(atlasPiece.highlightTexture)
    layer.addChild(sprite, highlightSprite)
    byId.set(definition.id, {
      id: definition.id,
      sprite,
      highlightSprite,
      hitPath: atlasPiece.hitPath,
    })
  }

  function pickPieceAt(
    x: number,
    y: number,
    options: { includeLocked?: boolean } = {}
  ): PieceId | null {
    let assistedHit: PieceId | null = null

    hitContext.lineWidth = HIT_ASSIST_RADIUS * 2
    hitContext.lineJoin = "round"
    hitContext.lineCap = "round"

    for (let index = layer.children.length - 1; index >= 0; index--) {
      const child = layer.children[index]
      const pieceId = child.label

      if (!pieceId) {
        continue
      }

      const piece = state.pieces[pieceId]
      const definition = state.definitions[pieceId]
      const view = byId.get(pieceId)

      if (
        !piece ||
        !definition ||
        !view ||
        (!options.includeLocked &&
          (piece.locked || state.groups[piece.groupId]?.locked))
      ) {
        continue
      }

      const localX = x - (piece.x - metrics.margin)
      const localY = y - (piece.y - metrics.margin)

      const insideHitBounds =
        localX >= -HIT_ASSIST_RADIUS &&
        localX <= metrics.textureWidth + HIT_ASSIST_RADIUS &&
        localY >= -HIT_ASSIST_RADIUS &&
        localY <= metrics.textureHeight + HIT_ASSIST_RADIUS

      if (insideHitBounds) {
        if (hitContext.isPointInPath(view.hitPath, localX, localY)) {
          return pieceId
        }

        if (
          assistedHit === null &&
          hitContext.isPointInStroke(view.hitPath, localX, localY)
        ) {
          assistedHit = pieceId
        }
      }
    }

    return assistedHit
  }

  function syncPiece(pieceId: PieceId): void {
    const view = byId.get(pieceId)
    const piece = state.pieces[pieceId]
    const definition = state.definitions[pieceId]

    if (!view || !piece || !definition) {
      return
    }

    view.sprite.position.set(piece.x - metrics.margin, piece.y - metrics.margin)
    view.highlightSprite.position.set(
      piece.x - metrics.margin,
      piece.y - metrics.margin
    )
    view.sprite.alpha = piece.locked ? 1 : 0.97
    view.highlightSprite.alpha = HIGHLIGHT_SPRITE_ALPHA
    view.highlightSprite.visible = allHighlighted && isPieceHighlightable(pieceId)
  }

  function syncPieces(pieceIds: PieceId[]): void {
    for (const pieceId of pieceIds) {
      syncPiece(pieceId)
    }
  }

  function setAllHighlighted(highlighted: boolean): void {
    allHighlighted = highlighted

    for (const view of byId.values()) {
      view.highlightSprite.visible = highlighted && isPieceHighlightable(view.id)
    }
  }

  function setHighlightColor(color: number): void {
    for (const view of byId.values()) {
      view.highlightSprite.tint = color
    }
  }

  function isPieceHighlightable(pieceId: PieceId): boolean {
    const piece = state.pieces[pieceId]

    return Boolean(
      piece && !piece.locked && !state.groups[piece.groupId]?.locked
    )
  }

  function syncAll(): void {
    syncPieces(Object.keys(state.pieces))
  }

  function raiseGroup(groupId: GroupId): void {
    const group = state.groups[groupId]

    if (!group) {
      return
    }

    for (const pieceId of group.pieceIds) {
      const view = byId.get(pieceId)

      if (view) {
        layer.addChild(view.sprite, view.highlightSprite)
      }
    }
  }

  syncAll()

  return {
    byId,
    pickPieceAt,
    syncPiece,
    syncPieces,
    syncAll,
    setAllHighlighted,
    setHighlightColor,
    raiseGroup,
    destroy() {
      const children = layer.removeChildren()

      for (const child of children) {
        child.destroy()
      }

      for (const texture of pieceTextures) {
        texture.destroy(false)
      }

      for (const texture of atlasTextures) {
        texture.destroy(true)
      }

      byId.clear()
    },
  }
}

interface ShapeMetrics {
  margin: number
  scale: number
  textureWidth: number
  textureHeight: number
  atlasCellWidth: number
  atlasCellHeight: number
}

interface AtlasPieceTexture {
  texture: Texture
  highlightTexture: Texture
  hitPath: Path2D
}

function createPieceAtlas(
  imageTexture: Texture,
  state: JigsawState,
  definitions: PieceDefinition[],
  metrics: ShapeMetrics
): { atlasTextures: Texture[]; byId: Map<PieceId, AtlasPieceTexture> } {
  const byId = new Map<PieceId, AtlasPieceTexture>()
  const atlasTextures: Texture[] = []
  const source = imageTexture.source.resource as CanvasImageSource
  const columns = Math.max(1, Math.floor(ATLAS_SIZE / metrics.atlasCellWidth))
  const rows = Math.max(1, Math.floor(ATLAS_SIZE / metrics.atlasCellHeight))
  const piecesPerAtlas = columns * rows
  const boardWidth = state.config.cols * state.config.pieceWidth
  const boardHeight = state.config.rows * state.config.pieceHeight

  for (
    let pageStart = 0;
    pageStart < definitions.length;
    pageStart += piecesPerAtlas
  ) {
    const pageDefinitions = definitions.slice(
      pageStart,
      pageStart + piecesPerAtlas
    )
    const usedRows = Math.ceil(pageDefinitions.length / columns)
    const atlasCanvas = document.createElement("canvas")
    atlasCanvas.width = columns * metrics.atlasCellWidth
    atlasCanvas.height = usedRows * metrics.atlasCellHeight
    const highlightCanvas = document.createElement("canvas")
    highlightCanvas.width = atlasCanvas.width
    highlightCanvas.height = atlasCanvas.height

    const context = atlasCanvas.getContext("2d")
    const highlightContext = highlightCanvas.getContext("2d")

    if (!context || !highlightContext) {
      continue
    }

    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = "high"

    const pagePieces: Array<{
      definition: PieceDefinition
      frame: Rectangle
      hitPath: Path2D
    }> = []

    for (let index = 0; index < pageDefinitions.length; index++) {
      const definition = pageDefinitions[index]
      const atlasCol = index % columns
      const atlasRow = Math.floor(index / columns)
      const atlasX = atlasCol * metrics.atlasCellWidth
      const atlasY = atlasRow * metrics.atlasCellHeight
      const hitPath = createPiecePath(definition, metrics)

      context.save()
      context.translate(atlasX, atlasY)
      context.scale(metrics.scale, metrics.scale)
      context.clip(hitPath)
      context.drawImage(
        source,
        metrics.margin - definition.col * state.config.pieceWidth,
        metrics.margin - definition.row * state.config.pieceHeight,
        boardWidth,
        boardHeight
      )
      context.restore()

      context.save()
      context.translate(atlasX, atlasY)
      context.scale(metrics.scale, metrics.scale)
      context.lineWidth = 0.8
      context.lineJoin = "round"
      context.lineCap = "round"
      context.strokeStyle = "rgba(5, 10, 16, 0.28)"
      context.stroke(hitPath)
      context.restore()

      highlightContext.save()
      highlightContext.translate(atlasX, atlasY)
      highlightContext.scale(metrics.scale, metrics.scale)
      highlightContext.lineJoin = "round"
      highlightContext.lineCap = "round"
      highlightContext.shadowColor = "rgba(255, 255, 255, 0.9)"
      highlightContext.shadowBlur = 7
      highlightContext.strokeStyle = "rgba(255, 255, 255, 0.32)"
      highlightContext.lineWidth = 5.5
      highlightContext.stroke(hitPath)
      highlightContext.shadowBlur = 3
      highlightContext.strokeStyle = "rgba(255, 255, 255, 0.5)"
      highlightContext.lineWidth = 2.8
      highlightContext.stroke(hitPath)
      highlightContext.shadowBlur = 0
      highlightContext.strokeStyle = "rgba(255, 255, 255, 0.85)"
      highlightContext.lineWidth = 1.1
      highlightContext.stroke(hitPath)
      highlightContext.restore()

      pagePieces.push({
        definition,
        frame: new Rectangle(
          atlasX,
          atlasY,
          metrics.atlasCellWidth,
          metrics.atlasCellHeight
        ),
        hitPath,
      })
    }

    const atlasTexture = Texture.from(atlasCanvas, true)
    const highlightAtlasTexture = Texture.from(highlightCanvas, true)
    atlasTextures.push(atlasTexture)
    atlasTextures.push(highlightAtlasTexture)

    for (const piece of pagePieces) {
      byId.set(piece.definition.id, {
        texture: new Texture({
          source: atlasTexture.source,
          frame: piece.frame,
        }),
        highlightTexture: new Texture({
          source: highlightAtlasTexture.source,
          frame: piece.frame,
        }),
        hitPath: piece.hitPath,
      })
    }
  }

  return { atlasTextures, byId }
}

function createShapeMetrics(state: JigsawState): ShapeMetrics {
  const t = state.config.tabSizePercent / 200
  const j = state.config.jitterPercent / 100
  const maxTabDepth =
    (3 * t + j) * Math.max(state.config.pieceWidth, state.config.pieceHeight)
  const margin = Math.ceil(maxTabDepth + 2)
  const textureWidth = Math.ceil(state.config.pieceWidth + margin * 2)
  const textureHeight = Math.ceil(state.config.pieceHeight + margin * 2)
  const scale = getEffectiveTextureScale(state, textureWidth, textureHeight)

  return {
    margin,
    scale,
    textureWidth,
    textureHeight,
    atlasCellWidth: Math.ceil(textureWidth * scale),
    atlasCellHeight: Math.ceil(textureHeight * scale),
  }
}

function getEffectiveTextureScale(
  state: JigsawState,
  textureWidth: number,
  textureHeight: number
): number {
  const requestedScale = Math.max(1, state.config.pieceTextureScale)
  const pieceCount = state.config.rows * state.config.cols
  const basePixels = textureWidth * textureHeight * pieceCount

  if (basePixels <= 0) {
    return 1
  }

  const maxScale = Math.sqrt(MAX_TOTAL_ATLAS_PIXELS / basePixels)

  return Math.max(1, Math.min(requestedScale, maxScale))
}

function createPiecePath(
  definition: PieceDefinition,
  metrics: ShapeMetrics
): Path2D {
  const path = new Path2D()
  const x = metrics.margin
  const y = metrics.margin
  const width = definition.width
  const height = definition.height

  path.moveTo(x, y)
  addEdge(path, x, y, x + width, y, 0, -1, definition.edges.top, height)
  addEdge(
    path,
    x + width,
    y,
    x + width,
    y + height,
    1,
    0,
    definition.edges.right,
    width
  )
  addEdge(
    path,
    x + width,
    y + height,
    x,
    y + height,
    0,
    1,
    definition.edges.bottom,
    height
  )
  addEdge(path, x, y + height, x, y, -1, 0, definition.edges.left, width)
  path.closePath()

  return path
}

function addEdge(
  path: Path2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  normalX: number,
  normalY: number,
  shape: PieceEdgeShape,
  perpendicularLength: number
): void {
  if (shape.points.length === 0) {
    path.lineTo(x2, y2)
    return
  }

  const deltaX = x2 - x1
  const deltaY = y2 - y1
  const length = Math.hypot(deltaX, deltaY)
  const unitX = deltaX / length
  const unitY = deltaY / length

  for (let index = 1; index < shape.points.length; index += 3) {
    const control1 = edgePointToWorld(
      shape.points[index],
      x1,
      y1,
      unitX,
      unitY,
      normalX,
      normalY,
      length,
      perpendicularLength
    )
    const control2 = edgePointToWorld(
      shape.points[index + 1],
      x1,
      y1,
      unitX,
      unitY,
      normalX,
      normalY,
      length,
      perpendicularLength
    )
    const end = edgePointToWorld(
      shape.points[index + 2],
      x1,
      y1,
      unitX,
      unitY,
      normalX,
      normalY,
      length,
      perpendicularLength
    )

    path.bezierCurveTo(
      control1.x,
      control1.y,
      control2.x,
      control2.y,
      end.x,
      end.y
    )
  }
}

function edgePointToWorld(
  point: PieceEdgePoint,
  x: number,
  y: number,
  unitX: number,
  unitY: number,
  normalX: number,
  normalY: number,
  length: number,
  perpendicularLength: number
): { x: number; y: number } {
  return {
    x: x + unitX * point.l * length + normalX * point.w * perpendicularLength,
    y: y + unitY * point.l * length + normalY * point.w * perpendicularLength,
  }
}

function createHitContext(): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas")
  canvas.width = 1
  canvas.height = 1

  const context = canvas.getContext("2d")

  if (!context) {
    throw new Error("2D canvas context is required for jigsaw hit testing")
  }

  return context
}
