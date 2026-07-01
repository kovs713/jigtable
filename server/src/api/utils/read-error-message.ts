export function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Internal error"
}
