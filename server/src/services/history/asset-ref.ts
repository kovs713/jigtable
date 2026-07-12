import { CryptoHasher } from "bun"

import type { JigsawHistoryItem, JigsawSafeAssetRef } from "./history-types"

export function createJigsawSafeAssetRef({
  imageUrl,
  assetId,
}: {
  imageUrl: string
  assetId: string
}): JigsawSafeAssetRef {
  const url = new URL(imageUrl, process.env.CLIENT_URL)

  if (url.pathname === "/test_jigsaw.png") {
    return {
      kind: "dev",
      assetId,
    }
  }

  if (url.pathname.startsWith("/api/compositions/")) {
    const parts = url.pathname.split("/").filter(Boolean)

    if (parts[1] === "compositions" && parts[2] && parts[3] === "rendered") {
      return {
        kind: "jigsaw_image",
        compositionId: parts[2],
        assetId,
      }
    }
  }

  return {
    kind: "external",
    assetId,
    sourceHash: hashToken(url.toString()),
    origin: url.origin,
  }
}

export function summarizeAssetRef(
  assetRef: JigsawSafeAssetRef
): JigsawHistoryItem["source"] {
  if (assetRef.kind === "dev") {
    return {
      kind: assetRef.kind,
      label: "Test jigsaw",
    }
  }

  if (assetRef.kind === "jigsaw_image") {
    return {
      kind: assetRef.kind,
      label: "Jigsaw image",
    }
  }

  return {
    kind: assetRef.kind,
    label: assetRef.origin
      ? `External image from ${assetRef.origin}`
      : "External image",
  }
}

export function hashToken(token: string): string {
  return new CryptoHasher("sha256").update(token).digest("hex")
}
