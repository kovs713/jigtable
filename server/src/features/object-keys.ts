export function batchPhotoObjectKey(batchId: string, fileId: string): string {
  return `batches/${batchId}/photos/${encodeURIComponent(fileId)}`
}

export function batchRenderObjectKey(batchId: string, format: string): string {
  const extension = format === "jpeg" ? "jpg" : format

  return `batches/${batchId}/render/canvas.${extension}`
}
