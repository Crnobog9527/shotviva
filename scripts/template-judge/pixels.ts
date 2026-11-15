import sharp from 'sharp'

import { readUserQr } from '../../src/core/poster/qr-paste'
import type { Alpha } from './checklist'

// The checks that need no model: whether the result is see-through, and whether it carries a QR
// code that reads back as expected. Free, exact, and run before the model so a failure here is
// never left to the model's eyes.

export type PixelVerdict = { id: 'alpha' | 'qr'; text: string; pass: boolean; reason: string }

const MAX_PIXELS = 120_000_000

// Any pixel below full opacity counts: a cut-out has many, an opaque photo none.
export async function seeThrough(bytes: Uint8Array): Promise<boolean> {
  const meta = await sharp(bytes, { limitInputPixels: MAX_PIXELS }).metadata()
  if (!meta.hasAlpha) return false
  const stats = await sharp(bytes, { limitInputPixels: MAX_PIXELS }).stats()
  const alpha = stats.channels.at(-1)
  return Boolean(alpha && alpha.min < 255)
}

export async function alphaCheck(bytes: Uint8Array, expected: Alpha): Promise<PixelVerdict | null> {
  if (expected === 'any') return null
  const clear = await seeThrough(bytes)
  if (expected === 'opaque') {
    return { id: 'alpha', text: 'The result is fully opaque (no see-through pixels).', pass: !clear, reason: clear ? 'Has see-through pixels.' : 'No see-through pixels.' }
  }
  return { id: 'alpha', text: 'The result is a cut-out (has a transparent background).', pass: clear, reason: clear ? 'Has a transparent area.' : 'No transparent pixels: not a cut-out.' }
}

export async function readQr(bytes: Uint8Array): Promise<string | null> {
  return (await readUserQr(bytes).catch(() => null))?.data ?? null
}

// `expected`: the text the code must say (from the batch file, or read from the input's QR slot);
// null when the input's own code could not be read, which fails the check rather than passing it.
export async function qrCheck(bytes: Uint8Array, expected: string | null): Promise<PixelVerdict> {
  const text = 'The result carries a QR code that reads back as the uploaded one.'
  if (expected === null) return { id: 'qr', text, pass: false, reason: 'The input QR code could not be read.' }
  const found = await readQr(bytes)
  if (found === null) return { id: 'qr', text, pass: false, reason: 'No readable QR code in the result.' }
  return { id: 'qr', text, pass: found === expected, reason: found === expected ? 'Reads back the same.' : 'Reads back different content.' }
}
