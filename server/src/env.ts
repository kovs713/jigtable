declare module "bun" {
  interface Env {
    BOT_TOKEN: string

    S3_ACCESS_KEY_ID: string
    S3_SECRET_ACCESS_KEY: string
    S3_ENDPOINT: string
    S3_BUCKET: string

    DB_USERNAME: string
    DB_PASSWORD: string
    DB_DATABASE: string
    DB_PORT: string
    DB_URL: string

    PORT: string
    CLIENT_URL: string
    PUBLIC_API_URL?: string
  }
}
