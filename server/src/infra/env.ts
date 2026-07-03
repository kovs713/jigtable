export function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim()

  if (!value) {
    throw new Error(`${name} is required`)
  }

  return value
}

export function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim()

  return value || undefined
}

export function readPortEnv(name: string, fallback: number): number {
  const raw = readOptionalEnv(name)

  if (!raw) {
    return fallback
  }

  const port = Number(raw)

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be a valid TCP port`)
  }

  return port
}

export function readOriginEnv(name: string): string {
  const value = readRequiredEnv(name)

  return parseOrigin(name, value)
}

export function readOptionalOriginEnv(name: string): string | undefined {
  const value = readOptionalEnv(name)

  return value ? parseOrigin(name, value) : undefined
}

function parseOrigin(name: string, value: string): string {
  try {
    return new URL(value).origin
  } catch {
    throw new Error(`${name} must be a valid URL`)
  }
}
