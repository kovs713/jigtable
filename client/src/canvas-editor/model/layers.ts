import type { CanvasItem, LayerAction, LayerEntry } from "./types"

export function getLayerEntries(items: CanvasItem[]): LayerEntry[] {
  return items
    .map((item, itemIndex) => ({
      item,
      itemIndex,
      zIndex: item.zIndex ?? itemIndex,
    }))
    .sort(
      (first, second) =>
        first.zIndex - second.zIndex || first.itemIndex - second.itemIndex
    )
    .map((entry, layerIndex) => ({
      item: entry.item,
      itemIndex: entry.itemIndex,
      layerIndex,
    }))
}

export function normalizeItemLayers(items: CanvasItem[]): CanvasItem[] {
  const zIndexById = new Map(
    getLayerEntries(items).map((entry) => [entry.item.id, entry.layerIndex])
  )

  return items.map((item, index) => ({
    ...item,
    zIndex: zIndexById.get(item.id) ?? index,
  }))
}

export function moveLayer(
  items: CanvasItem[],
  itemId: string,
  targetLayerIndex: number
): CanvasItem[] {
  const entries = getLayerEntries(items)
  const fromIndex = entries.findIndex((entry) => entry.item.id === itemId)

  if (fromIndex < 0) return items

  const nextEntries = [...entries]
  const [entry] = nextEntries.splice(fromIndex, 1)
  const nextIndex = Math.min(Math.max(targetLayerIndex, 0), entries.length - 1)
  nextEntries.splice(nextIndex, 0, entry)

  return applyLayerOrder(items, nextEntries)
}

export function reorderLayer(
  items: CanvasItem[],
  itemId: string,
  targetItemId: string,
  placement: "above" | "below"
): CanvasItem[] {
  const entries = getLayerEntries(items)
  const sourceIndex = entries.findIndex((entry) => entry.item.id === itemId)

  if (sourceIndex < 0) return items

  const nextEntries = [...entries]
  const [entry] = nextEntries.splice(sourceIndex, 1)
  const targetIndex = nextEntries.findIndex(
    (candidate) => candidate.item.id === targetItemId
  )

  if (targetIndex < 0) return items

  nextEntries.splice(
    placement === "above" ? targetIndex + 1 : targetIndex,
    0,
    entry
  )
  return applyLayerOrder(items, nextEntries)
}

export function getLayerActionKey(itemId: string, action: LayerAction): string {
  return `${itemId}:${action}`
}

function applyLayerOrder(
  items: CanvasItem[],
  entries: LayerEntry[]
): CanvasItem[] {
  const zIndexById = new Map(
    entries.map((entry, index) => [entry.item.id, index])
  )

  return items.map((item, index) => ({
    ...item,
    zIndex: zIndexById.get(item.id) ?? index,
  }))
}
