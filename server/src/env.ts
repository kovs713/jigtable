declare module "bun" {
  interface Env {
    PORT: string
    CLIENT_URL: string
    PUBLIC_API_URL: string
    NODE_ENV?: string

    BOT_TOKEN: string

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
