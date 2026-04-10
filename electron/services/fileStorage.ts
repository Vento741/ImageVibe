import fs from 'fs';
import path from 'path';
import { shell } from 'electron';
import sharp from 'sharp';
import { getConfig } from './configManager';
import { embedMetadata } from './pngMetadata';

/**
 * Save a generated image to disk with embedded metadata.
 * Returns the full file path.
 */
export function saveImage(
  imageBase64: string,
  metadata: Record<string, string>
): string {
  const config = getConfig();
  const imagesDir = config.storage.imagesPath;

  // Ensure directory exists
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  // Generate unique filename: YYYY-MM-DD_HHmmss_<random>.png
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10);
  const timePart = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const random = Math.random().toString(36).substring(2, 8);
  const fileName = `${datePart}_${timePart}_${random}.png`;
  const filePath = path.join(imagesDir, fileName);

  // Decode base64 to buffer
  let imageBuffer: Buffer;

  // Handle both raw base64 and data URI
  if (imageBase64.startsWith('data:image/')) {
    const base64Data = imageBase64.split(',')[1];
    imageBuffer = Buffer.from(base64Data, 'base64');
  } else {
    imageBuffer = Buffer.from(imageBase64, 'base64');
  }

  // Embed metadata into PNG
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (imageBuffer.subarray(0, 8).equals(pngSignature) && Object.keys(metadata).length > 0) {
    imageBuffer = embedMetadata(imageBuffer, metadata);
  }

  // Write to disk
  fs.writeFileSync(filePath, imageBuffer);

  return filePath;
}

/**
 * Delete an image file from disk.
 */
export function deleteImage(filePath: string): boolean {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Get file size in bytes.
 */
export function getFileSize(filePath: string): number {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch {
    return 0;
  }
}

/**
 * Export an image, converting to the requested format via sharp.
 * PNG is copied directly to preserve embedded metadata chunks.
 */
export async function exportImage(
  sourcePath: string,
  destPath: string,
  format: 'png' | 'jpeg' | 'webp' = 'png',
  quality?: number,
): Promise<string> {
  if (format === 'png') {
    // Copy as-is to preserve ImageVibe tEXt metadata chunks
    fs.copyFileSync(sourcePath, destPath);
    return destPath;
  }

  if (format === 'webp') {
    try {
      await sharp(sourcePath).webp({ quality: quality ?? 80 }).toFile(destPath);
    } catch (err) {
      try { fs.unlinkSync(destPath); } catch { /* partial file cleanup */ }
      throw err;
    }
    return destPath;
  }

  if (format === 'jpeg') {
    try {
      await sharp(sourcePath).jpeg({ quality: quality ?? 85 }).toFile(destPath);
    } catch (err) {
      try { fs.unlinkSync(destPath); } catch { /* partial file cleanup */ }
      throw err;
    }
    return destPath;
  }

  // Fallback: unknown format, just copy
  fs.copyFileSync(sourcePath, destPath);
  return destPath;
}

/**
 * Open a folder in the system file manager.
 */
export function openFolder(folderPath: string): void {
  shell.openPath(folderPath);
}

/**
 * Get the images directory path, creating it if needed.
 */
export function getImagesDir(): string {
  const config = getConfig();
  const dir = config.storage.imagesPath;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}
