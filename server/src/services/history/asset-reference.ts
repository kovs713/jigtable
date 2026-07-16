import { createHash } from "node:crypto"

import type { AssetReference, AssetSource } from "./types"

const DEFAULT_DEVELOPMENT_ASSET_PATH = "/test_jigsaw.png"
const COMPOSITION_RENDER_PATH = /^\/api\/compositions\/([^/]+)\/rendered\/?$/

type CreateAssetReferenceInput = {
  imageUrl: string
  assetId: string
  baseUrl: string | URL
  developmentAssetPath?: string
}

export function createAssetReference({
  imageUrl,
  assetId,
  baseUrl,
  developmentAssetPath = DEFAULT_DEVELOPMENT_ASSET_PATH,
}: CreateAssetReferenceInput): AssetReference {
  const url = new URL(imageUrl, baseUrl)

  if (url.pathname === developmentAssetPath) {
    return {
      kind: "development",
      assetId,
    }
  }

  const compositionMatch = url.pathname.match(COMPOSITION_RENDER_PATH)

  if (compositionMatch?.[1]) {
    return {
      kind: "composition",
      compositionId: compositionMatch[1],
      assetId,
    }
  }

  return {
    kind: "external",
    assetId,
    sourceHash: sha256(url.toString()),
    origin: url.origin,
  }
}

export function summarizeAssetReference(assetRef: AssetReference): AssetSource {
  switch (assetRef.kind) {
    case "development":
      return {
        kind: assetRef.kind,
        label: "Test image",
      }

    case "composition":
      return {
        kind: assetRef.kind,
        label: "Composition",
      }

    case "external":
      return {
        kind: assetRef.kind,
        label: assetRef.origin
          ? `External image from ${assetRef.origin}`
          : "External image",
      }
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}
