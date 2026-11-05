import 'server-only'

import sharp from 'sharp'

import { WATERMARK_PNG_BASE64 } from './watermark-asset.generated'

const WATERMARK = Buffer.from(WATERMARK_PNG_BASE64, 'base64')

// The mark spans about a third of the width so it reads on a phone without hiding the dish.
const MARK_WIDTH_RATIO = 0.32
const MARGIN_RATIO = 0.025

// Only free users' public works pass through here (ARCHITECTURE §6.2): the single stored
// output stays clean, so a later purchase removes the mark without reprocessing anything.
export function shouldWatermark(visibility: 'public' | 'private', ownerIsPaid: boolean): boolean {
  return visibility === 'public' && !ownerIsPaid
}

// Re-encoded as JPEG so the response stays far below Vercel's 4.5MB body limit, whatever
// size the provider's PNG was (AGENTS §6).
export async function applyWatermark(image: Uint8Array): Promise<Uint8Array> {
  const base = sharp(image)
  const { width, height } = await base.metadata()
  if (!width || !height) throw new Error('watermark: image has no dimensions')

  const markWidth = Math.max(1, Math.round(width * MARK_WIDTH_RATIO))
  const mark = await sharp(WATERMARK).resize({ width: markWidth }).toBuffer({ resolveWithObject: true })
  const margin = Math.round(Math.min(width, height) * MARGIN_RATIO)
  const left = Math.max(0, width - mark.info.width - margin)
  const top = Math.max(0, height - mark.info.height - margin)

  const output = await base
    .composite([{ input: mark.data, left, top }])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer()
  return new Uint8Array(output)
}
