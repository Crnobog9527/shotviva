import 'server-only'

import sharp from 'sharp'

import { logger } from '../logger'
import { inputPreviewKeyFor } from './keys'
import type { ObjectStore } from './object-store'
import { INPUT_PREVIEW_PX } from './rules'

// ARCHITECTURE §8 「原图小图」 (T32): the full upload is deleted after 7 days, so the photo page
// keeps this small copy to show what the result was made from, for as long as the result.
const INPUT_PREVIEW_QUALITY = 80

// sharp drops all metadata unless asked to keep it, so EXIF and GPS never reach the copy;
// rotate() bakes in the orientation first so the preview is not shown sideways.
export async function renderInputPreview(bytes: Uint8Array): Promise<Uint8Array> {
  const output = await sharp(bytes)
    .rotate()
    .resize({ width: INPUT_PREVIEW_PX, height: INPUT_PREVIEW_PX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: INPUT_PREVIEW_QUALITY })
    .toBuffer()
  return new Uint8Array(output)
}

// Runs after the job is confirmed. Never throws: a missing preview only means the photo page
// says the original is gone, which must not turn a paid, finished result into an error.
export async function writeInputPreview(store: ObjectStore, input: { userId: string; jobId: string; bytes: Uint8Array }): Promise<boolean> {
  try {
    const preview = await renderInputPreview(input.bytes)
    await store.put(inputPreviewKeyFor(input.userId, input.jobId), preview, 'image/webp')
    return true
  } catch (error) {
    logger.warn('input preview not written', { jobId: input.jobId, error })
    return false
  }
}
