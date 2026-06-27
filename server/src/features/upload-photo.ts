import { s3Client } from "../infra/storage";
import { photoObjectKey } from "./photo-object-key";

export async function uploadPhoto(
  chatId: number,
  userId: number,
  fileUrl: string,
  fileId: string,
): Promise<void> {
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to download an image: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  await s3Client.write(photoObjectKey(chatId, userId, fileId), buffer);
}
