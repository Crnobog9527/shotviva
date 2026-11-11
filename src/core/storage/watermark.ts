import 'server-only'

import sharp from 'sharp'

import { WHITE } from './flatten'
import type { DownloadBackground } from './rules/download-background'
import { WATERMARK_PNG_BASE64 } from './watermark-asset.generated'

const WATERMARK = Buffer.from(WATERMARK_PNG_BASE64, 'base64')

// The mark spans about a third of the width so it reads on a phone without hiding the dish.
const MARK_WIDTH_RATIO = 0.32
const MARGIN_RATIO = 0.025

// Decided per work, never by the owner's membership (ARCHITECTURE §6.2): works charged to
// the free pool are always marked, paid works never are, whatever their visibility or the
// owner's paid_until. The single stored output stays clean either way.
export function shouldWatermark(creditPool: 'free' | 'paid'): boolean {
  return creditPool === 'free'
}

// White (the default, and what every display of a free work uses): re-encoded as JPEG so the
// response stays far below Vercel's 4.5MB body limit, whatever size the provider's PNG was
// (AGENTS §6). Transparent (a cut-out's 透明底 download): the same mark on the PNG with its alpha
// kept; the caller stages that file on R2 because a PNG can pass the limit.
export async function applyWatermark(image: Uint8Array, background: DownloadBackground = 'white'): Promise<Uint8Array> {
  const base = sharp(image)
  const { width, height } = await base.metadata()
  if (!width || !height) throw new Error('watermark: image has no dimensions')

  const markWidth = Math.max(1, Math.round(width * MARK_WIDTH_RATIO))
  const mark = await sharp(WATERMARK).resize({ width: markWidth }).toBuffer({ resolveWithObject: true })
  const margin = Math.round(Math.min(width, height) * MARGIN_RATIO)
  const left = Math.max(0, width - mark.info.width - margin)
  const top = Math.max(0, height - mark.info.height - margin)
  const placed = { input: mark.data, left, top }

  if (background === 'transparent') {
    return new Uint8Array(await base.ensureAlpha().composite([placed]).png({ compressionLevel: 9 }).toBuffer())
  }
  // JPEG has no alpha: a cut-out would otherwise flatten to black. White is how the app shows
  // cut-outs; the mark is composited after, on top.
  const output = await base.flatten({ background: WHITE }).composite([placed]).jpeg({ quality: 90, mozjpeg: true }).toBuffer()
  return new Uint8Array(output)
}
