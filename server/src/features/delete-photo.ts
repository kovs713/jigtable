import { s3Client } from "../infra/storage";

export async function deletePhoto(fileId: string): Promise<void> {
  const isExist = await s3Client.exists(fileId);
  if (isExist) {
    await s3Client.delete(fileId);
  }
}
