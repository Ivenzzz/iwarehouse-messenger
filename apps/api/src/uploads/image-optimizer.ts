import { Logger } from '@nestjs/common';
import { stat, unlink } from 'fs/promises';
import sharp from 'sharp';

// Server-side image optimization (storage sustainability).
// A phone photo arrives at 3–8 MB / 4000px; nobody views chat images beyond
// ~2000px. Downscaling + recompressing typically shrinks photos 8–12× with
// no visible loss, which is the difference between a disk lasting months and
// lasting years.
//
// Rules:
// - JPEG/WebP → resized to fit IMAGE_MAX_EDGE, re-encoded as JPEG (quality
//   IMAGE_JPEG_QUALITY). EXIF is stripped (privacy: gallery photos carry GPS
//   EXIF the user may not intend to share — our stamped camera burns intended
//   location INTO the pixels instead) after orientation is baked in.
// - PNG → resized only, stays PNG (screenshots keep crisp text and
//   transparency).
// - GIF untouched (animation). Anything else untouched.
// - The optimized file is adopted ONLY if it's actually smaller; otherwise
//   the original is kept. Any processing error falls back to the original —
//   optimization must never block a send.

const logger = new Logger('ImageOptimizer');

const ENABLED = process.env.IMAGE_OPTIMIZE !== 'false';
const MAX_EDGE = Number(process.env.IMAGE_MAX_EDGE ?? 2048);
const JPEG_QUALITY = Number(process.env.IMAGE_JPEG_QUALITY ?? 82);

const OPTIMIZABLE = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface OptimizedFile {
  path: string;
  size: number;
  mimeType: string;
  cleanup: () => Promise<void>;
}

export async function optimizeImage(
  path: string,
  size: number,
  mimeType: string,
): Promise<OptimizedFile> {
  const passthrough: OptimizedFile = {
    path,
    size,
    mimeType,
    cleanup: async () => undefined,
  };
  if (!ENABLED || !OPTIMIZABLE.has(mimeType)) return passthrough;

  const outPath = `${path}.opt`;
  try {
    const pipeline = sharp(path, { failOn: 'none' })
      .rotate() // bake EXIF orientation before metadata is stripped
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true });

    let outMime = mimeType;
    if (mimeType === 'image/png') {
      await pipeline.png({ compressionLevel: 9 }).toFile(outPath);
    } else {
      await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toFile(outPath);
      outMime = 'image/jpeg';
    }

    const optimized = await stat(outPath);
    if (optimized.size >= size) {
      // Already efficient — keep the original.
      await unlink(outPath).catch(() => undefined);
      return passthrough;
    }
    return {
      path: outPath,
      size: optimized.size,
      mimeType: outMime,
      cleanup: () => unlink(outPath).catch(() => undefined) as Promise<void>,
    };
  } catch (err) {
    logger.warn(`image optimization skipped: ${(err as Error).message}`);
    await unlink(outPath).catch(() => undefined);
    return passthrough;
  }
}

// Avatars never need more than a small square.
export async function optimizeAvatar(
  path: string,
  size: number,
  mimeType: string,
): Promise<OptimizedFile> {
  const passthrough: OptimizedFile = { path, size, mimeType, cleanup: async () => undefined };
  if (!OPTIMIZABLE.has(mimeType)) return passthrough;
  const outPath = `${path}.opt`;
  try {
    await sharp(path, { failOn: 'none' })
      .rotate()
      .resize({ width: 512, height: 512, fit: 'cover' })
      .jpeg({ quality: 85, mozjpeg: true })
      .toFile(outPath);
    const optimized = await stat(outPath);
    return {
      path: outPath,
      size: optimized.size,
      mimeType: 'image/jpeg',
      cleanup: () => unlink(outPath).catch(() => undefined) as Promise<void>,
    };
  } catch {
    await unlink(outPath).catch(() => undefined);
    return passthrough;
  }
}
