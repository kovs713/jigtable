import { isRecord } from "@jigtable/shared/utils"

export function readApiError(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.error)) {
    return null
  }

  return typeof value.error.message === "string" ? value.error.message : null
}

export async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      readApiError(payload) ?? `Request failed: ${response.status}`
    )
  }

  return payload as T
}
