declare module "bun" {
  interface Env {
    PORT: string
    CLIENT_URL: string
    PUBLIC_API_URL: string
    CORS_ORIGIN: string
    NODE_ENV?: string

    BOT_TOKEN: string
    ADMIN_USER_ID: string

    S3_ENDPOINT: string
    S3_REGION: string
    S3_FORCE_PATH_STYLE: string
    S3_TENANT_ID: string
    S3_KEY_ID: string
    S3_ACCESS_KEY_ID: string
    S3_SECRET_ACCESS_KEY: string
    S3_BUCKET: string
    S3_PUBLIC_URL: string

    DB_USERNAME: string
    DB_PASSWORD: string
    DB_DATABASE: string
    DB_PORT: string
    DB_URL: string
  }
}

export const LIMITS = {
  jsonBodyBytes: 1 * 1024 * 1024, // 1 MB

  uploadPhotoBytes: 10 * 1024 * 1024, // 10 MB
  photosPerBatch: 50,

  layout: {
    maxCanvasWidth: 10_000,
    maxCanvasHeight: 10_000,
    maxCanvasArea: 70_000_000,

    maxItems: 100,
    maxItemWidth: 5_000,
    maxItemHeight: 5_000,
    maxItemArea: 12_000_000,
  },

  render: {
    imageFetchConcurrency: 4,
  },

  jigsaw: {
    createRoomPerIpPerMinute: 10,
    createSessionPerIpPerMinute: 30,
    roomTtlMs: 6 * 60 * 60 * 1000, // 6h
    cleanupIntervalMs: 10 * 60 * 1000, // 10m
    pingCooldownMs: 1000,
  },
} as const
