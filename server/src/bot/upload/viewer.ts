import type { UploadSession, UploadedImage } from "@/bot/types"

export function getActiveImages(session: UploadSession): UploadedImage[] {
  return session.images.filter((image) => image.status === "active")
}

export function getDeletedImages(session: UploadSession): UploadedImage[] {
  return session.images.filter((image) => image.status === "deleted")
}

export function getCurrentViewerIndex(session: UploadSession): number {
  const active = getActiveImages(session)

  if (active.length === 0) return -1
  if (!session.viewerImageId) return 0

  const index = active.findIndex((image) => image.id === session.viewerImageId)

  return index >= 0 ? index : 0
}

export function getViewerImage(
  session: UploadSession
): UploadedImage | undefined {
  const active = getActiveImages(session)
  if (active.length === 0) return undefined

  return active[getCurrentViewerIndex(session)]
}

export function selectNextViewerImage(session: UploadSession): void {
  const active = getActiveImages(session)
  if (active.length === 0) return

  const nextImage = active[getCurrentViewerIndex(session) + 1]
  if (nextImage) session.viewerImageId = nextImage.id
}

export function selectPrevViewerImage(session: UploadSession): void {
  const active = getActiveImages(session)
  if (active.length === 0) return

  const previousImage = active[getCurrentViewerIndex(session) - 1]
  if (previousImage) session.viewerImageId = previousImage.id
}

export function deleteCurrentViewerImage(session: UploadSession): boolean {
  const activeBeforeDelete = getActiveImages(session)
  const currentIndex = getCurrentViewerIndex(session)
  const currentImage = activeBeforeDelete[currentIndex]

  if (!currentImage) return false

  currentImage.status = "deleted"

  const activeAfterDelete = getActiveImages(session)

  if (activeAfterDelete.length === 0) {
    session.viewerImageId = undefined
    return true
  }

  const nextIndex = Math.min(currentIndex, activeAfterDelete.length - 1)

  session.viewerImageId = activeAfterDelete[nextIndex]?.id
  return true
}
