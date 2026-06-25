import { s3Client } from "../infra/storage";

export async function uploadPhoto(fileUrl: string, fileId: string) {
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to download an image: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await s3Client.write(`test/говно-${fileId}`, buffer);
}
