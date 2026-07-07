import type { UploadSession, UploadedImage } from "@/bot/types"

export function getActiveImages(session: UploadSession): UploadedImage[] {
  return session.images.filter((img) => img.status === "active")
}

export function getDeletedImages(session: UploadSession): UploadedImage[] {
  return session.images.filter((img) => img.status === "deleted")
}

export function getCurrentViewerIndex(session: UploadSession): number {
  const active = getActiveImages(session)
  if (active.length === 0) return -1
  if (!session.viewerImageId) return 0
  const idx = active.findIndex((img) => img.id === session.viewerImageId)
  return idx >= 0 ? idx : 0
}

export function getViewerImage(
  session: UploadSession
): UploadedImage | undefined {
  const active = getActiveImages(session)
  if (active.length === 0) return undefined
  const idx = getCurrentViewerIndex(session)
  return active[idx]
}

export function selectNextViewerImage(session: UploadSession): void {
  const active = getActiveImages(session)
  if (active.length === 0) return
  const idx = getCurrentViewerIndex(session)
  const next = idx + 1
  const img = active[next]
  if (img) {
    session.viewerImageId = img.id
  }
}

export function selectPrevViewerImage(session: UploadSession): void {
  const active = getActiveImages(session)
  if (active.length === 0) return
  const idx = getCurrentViewerIndex(session)
  const prev = idx - 1
  const img = active[prev]
  if (img) {
    session.viewerImageId = img.id
  }
}

export function deleteCurrentViewerImage(session: UploadSession): boolean {
  const img = getViewerImage(session)
  if (!img) return false
  img.status = "deleted"
  const active = getActiveImages(session)
  if (active.length === 0) {
    session.viewerImageId = undefined
    return true
  }
  const idx = getCurrentViewerIndex(session)
  const nextImg = active[idx] ?? active[active.length - 1]
  if (nextImg) {
    session.viewerImageId = nextImg.id
  }
  return true
}
