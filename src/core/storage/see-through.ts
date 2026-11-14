import 'server-only'

import sharp from 'sharp'

import { matteFor, type Matte } from './rules'

// Server half of rules/alpha-matte.ts: which ground a see-through image gets before it is sent to
// an image model, and laying it there. Image models read only colour: a transparent area either
// turns black in a JPEG (the 2026-11-14 black-logo bug) or is guessed at, so every model input
// with alpha is flattened first. The stored file is never changed; only the bytes sent are.

// Plenty to judge the content's brightness, and cheap next to a 2048 decode.
const SAMPLE_EDGE = 256
const MAX_INPUT_PIXELS = 120_000_000

export async function matteOf(bytes: Uint8Array): Promise<Matte | null> {
  const meta = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()
  if (!meta.hasAlpha) return null
  const { data } = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
    .resize({ width: SAMPLE_EDGE, height: SAMPLE_EDGE, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return matteFor(data)
}

// A WebP reference (style refs are stored as WebP) with any see-through area flattened; an opaque
// one comes back as the same bytes. The references were decoded when the admin saved them, so
// one that will not decode now is sent as it is and the provider's answer decides, as before.
export async function opaqueWebp(bytes: Uint8Array): Promise<Uint8Array> {
  const matte = await matteOf(bytes).catch(() => null)
  if (!matte) return bytes
  const output = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).flatten({ background: matte }).webp({ quality: 86 }).toBuffer()
  return new Uint8Array(output)
}
