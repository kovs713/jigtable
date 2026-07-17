import type { AssetSource, HistoryEntry, RoomResult } from "@/services/history"

type ApiAssetSource = {
  kind: "dev" | "jigsaw_image" | "external"
  label: string
}

export function toHistoryEntryResponse(entry: HistoryEntry) {
  const { config, source, ...result } = entry

  return {
    ...result,
    jigsawConfig: config,
    source: toAssetSourceResponse(source),
  }
}

export function toRoomResultResponse(result: RoomResult) {
  const { config, ...response } = result

  return {
    ...response,
    jigsawConfig: config,
  }
}

function toAssetSourceResponse(source: AssetSource): ApiAssetSource {
  switch (source.kind) {
    case "development":
      return { kind: "dev", label: "Test jigsaw" }

    case "composition":
      return { kind: "jigsaw_image", label: "Jigsaw image" }

    case "external":
      return { kind: source.kind, label: source.label }
  }
}
