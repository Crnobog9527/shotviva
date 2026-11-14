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

// The public gallery's copy of a work (ARCHITECTURE §9 第 3、9 条): scaled to `width` (never
// up), marked when the work was made with free credits (same rule as the download), WebP. A
// cut-out keeps its transparency; the mark sits on top.
export async function galleryImage(image: Uint8Array, width: number, watermark: boolean): Promise<Uint8Array> {
  const scaled = await sharp(image).resize({ width, withoutEnlargement: true }).toBuffer({ resolveWithObject: true })
  let base = sharp(scaled.data)
  if (watermark) {
    const markWidth = Math.max(1, Math.round(scaled.info.width * MARK_WIDTH_RATIO))
    const mark = await sharp(WATERMARK).resize({ width: markWidth }).toBuffer({ resolveWithObject: true })
    const margin = Math.round(Math.min(scaled.info.width, scaled.info.height) * MARGIN_RATIO)
    base = base.composite([
      {
        input: mark.data,
        left: Math.max(0, scaled.info.width - mark.info.width - margin),
        top: Math.max(0, scaled.info.height - mark.info.height - margin),
      },
    ])
  }
  return new Uint8Array(await base.webp({ quality: 80 }).toBuffer())
}

// The mark for a picture of this size: about a third of its width, tucked into the bottom-right.
async function markOverlay(width: number, height: number) {
  const mark = await sharp(WATERMARK)
    .resize({ width: Math.max(1, Math.round(width * MARK_WIDTH_RATIO)) })
    .toBuffer({ resolveWithObject: true })
  const margin = Math.round(Math.min(width, height) * MARGIN_RATIO)
  return { input: mark.data, left: Math.max(0, width - mark.info.width - margin), top: Math.max(0, height - mark.info.height - margin) }
}

// The small copy of a work its owner sees in lists (ARCHITECTURE §8.3「作品小图」): the short edge
// scaled to `shortEdge` (never up), so it still fills a 4:5 tile whatever the work's shape; a
// cut-out sits on white, as everywhere the app shows one small; marked when the work was made
// with free credits, like the full file. WebP.
export async function workThumbImage(image: Uint8Array, shortEdge: number, watermark: boolean): Promise<Uint8Array> {
  const scaled = await sharp(image)
    .resize({ width: shortEdge, height: shortEdge, fit: 'outside', withoutEnlargement: true })
    .flatten({ background: WHITE })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width, height, channels } = scaled.info
  let base = sharp(scaled.data, { raw: { width, height, channels } })
  if (watermark) base = base.composite([await markOverlay(width, height)])
  return new Uint8Array(await base.webp({ quality: 78 }).toBuffer())
}
