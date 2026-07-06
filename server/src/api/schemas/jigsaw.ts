import { optional, record, string } from "@jigtable/shared"

import { parseApiSchema } from "../utils/request"

export function readJigsawProfileInput(value: unknown): {
  name?: string
  color?: string
} {
  const bodyResult = record().parse(value)
  const body = bodyResult.ok ? bodyResult.value : {}
  const playerResult = record().parse(body.player)
  const source = playerResult.ok ? playerResult.value : body

  return {
    name: parseApiSchema(optional(string()), source.name, "name")?.trim(),
    color: parseApiSchema(optional(string()), source.color, "color")?.trim(),
  }
}
