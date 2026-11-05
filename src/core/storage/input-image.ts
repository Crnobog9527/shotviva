import 'server-only'

import sharp from 'sharp'

import { AppError } from '../errors'
import { logger } from '../logger'
import type { ObjectStore } from './object-store'
import { INPUT_JPEG_QUALITY, INPUT_LONG_EDGE, isUploadContentType, MAX_UPLOAD_BYTES } from './rules'
import { sniffImageType } from './sniff'

// width / height are the normalized image's, so 'original' outputs follow the photo's ratio.
export type InputImage = { bytes: Uint8Array; contentType: 'image/jpeg'; width: number; height: number }

// Well above 2048² and any phone camera, well below what would exhaust function memory.
const MAX_INPUT_PIXELS = 120_000_000

// A rejected upload is deleted at once rather than left for the 7-day lifecycle: it is
// either too big to keep around or not an image at all (ARCHITECTURE §8.2).
async function reject(store: ObjectStore, key: string, code: 'IMAGE_TOO_LARGE' | 'IMAGE_UNSUPPORTED', reason: string) {
  await store.delete(key).catch((error: unknown) => logger.warn('rejected upload not deleted', { key, error }))
  logger.info('upload rejected', { key, reason })
  return new AppError(code, code === 'IMAGE_TOO_LARGE' ? 'Photo is larger than 20MB' : 'Please use a JPEG, PNG or WebP photo')
}

// Normal uploads are already ≤2048 JPEGs; this also covers the browser-compression fallback,
// where the original (≤20MB) was uploaded as-is. rotate() bakes in EXIF orientation and the
// re-encode drops all metadata, GPS included.
export async function normalizeInputImage(bytes: Uint8Array): Promise<Uint8Array> {
  const output = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({ width: INPUT_LONG_EDGE, height: INPUT_LONG_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: Math.round(INPUT_JPEG_QUALITY * 100) })
    .toBuffer()
  return new Uint8Array(output)
}

// The server-side gate before any credit moves: HEAD for size and declared type, then the
// bytes themselves (magic number, then a real decode). Anything failing is deleted → 422.
export async function loadInputImage(store: ObjectStore, key: string): Promise<InputImage> {
  const head = await store.head(key)
  if (!head) throw new AppError('INVALID_INPUT', 'Upload not found; please choose the photo again')
  if (head.size > MAX_UPLOAD_BYTES) throw await reject(store, key, 'IMAGE_TOO_LARGE', 'size')
  if (!head.contentType || !isUploadContentType(head.contentType)) {
    throw await reject(store, key, 'IMAGE_UNSUPPORTED', 'content-type')
  }

  const bytes = await store.get(key)
  // Guards a GET racing a re-PUT of the same key with a bigger body.
  if (bytes.length > MAX_UPLOAD_BYTES) throw await reject(store, key, 'IMAGE_TOO_LARGE', 'size')
  const sniffed = sniffImageType(bytes)
  if (!sniffed || !isUploadContentType(sniffed)) throw await reject(store, key, 'IMAGE_UNSUPPORTED', `magic:${sniffed}`)

  try {
    const normalized = await normalizeInputImage(bytes)
    const { width, height } = await sharp(normalized).metadata()
    return { bytes: normalized, contentType: 'image/jpeg', width, height }
  } catch {
    throw await reject(store, key, 'IMAGE_UNSUPPORTED', 'decode')
  }
}
