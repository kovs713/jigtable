import { S3Client } from "bun"

import { readRequiredEnv } from "@/infra/env"

export const s3Client = new S3Client({
  accessKeyId: readRequiredEnv("S3_ACCESS_KEY_ID"),
  secretAccessKey: readRequiredEnv("S3_SECRET_ACCESS_KEY"),
  endpoint: readRequiredEnv("S3_ENDPOINT"),
  region: readRequiredEnv("S3_REGION"),
  bucket: readRequiredEnv("S3_BUCKET"),
})
