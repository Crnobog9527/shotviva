import 'server-only'

import { cacheLife } from 'next/cache'

import { FAILED_READ_LIFE } from '../cache-life'
import { logger } from '../logger'
import { imageSize } from './image-header'

// How much of a cover to fetch: a WebP or PNG header is in the first 32 bytes; a JPEG's frame
// size can sit after its EXIF block, so a little more.
const HEADER_BYTES = 65_536

// A cover's width / height, read from the first bytes of the file (a Range request), so the home
// generator's preview frame can take the template's own shape on the server (no crop, no layout
// shift; Owner 2026-11-12). Cover file names carry a content hash (ARCHITECTURE §8.3): a URL never
// changes its picture, so a good read is kept as long as the cache keeps anything. null (kept a
// minute) when the file cannot be read.
export async function coverRatio(url: string | null): Promise<number | null> {
  'use cache'
  if (!url) return null
  try {
    const response = await fetch(url, { headers: { Range: `bytes=0-${HEADER_BYTES - 1}` } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const size = imageSize(new Uint8Array(await response.arrayBuffer()))
    if (!size) throw new Error('unknown image format')
    cacheLife('max')
    return size.width / size.height
  } catch (error) {
    cacheLife(FAILED_READ_LIFE)
    logger.error('templates.cover_ratio_failed', { error })
    return null
  }
}

// The preview's first frame: the cover at 384 px (at least the phone frame's CSS width, so the
// browser counts this paint as the picture's, like the hero's frames, scripts/first-frames.ts),
// AVIF at quality 30 (about 5 KB), as a data: URI the HTML carries. On a phone the preview sits
// under the hero and can be the first screen's largest picture; with its frame in the document it
// paints with the page instead of a request later (measured on /zh: +0.5–0.8 s without it).
const FRAME_WIDTH = 384
export async function coverFirstFrame(url: string | null): Promise<string | null> {
  'use cache'
  if (!url) return null
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const { default: sharp } = await import('sharp')
    const frame = await sharp(Buffer.from(await response.arrayBuffer())).resize({ width: FRAME_WIDTH }).avif({ quality: 30, effort: 4 }).toBuffer()
    cacheLife('max')
    return `data:image/avif;base64,${frame.toString('base64')}`
  } catch (error) {
    cacheLife(FAILED_READ_LIFE)
    logger.error('templates.cover_first_frame_failed', { error })
    return null
  }
}

type Covers = { id: string; coverAfterUrl: string | null; coverPosterUrl: string | null; coverBeforeUrl: string | null }

// The covers the home generator opens on (its default template): their shapes and the preview's
// first frame, read in parallel; null without a template.
export async function openingCovers(template: Covers | undefined) {
  if (!template) return null
  const url = template.coverAfterUrl ?? template.coverPosterUrl
  const [after, beforeRatio, firstFrame] = await Promise.all([coverRatio(url), coverRatio(template.coverBeforeUrl), coverFirstFrame(url)])
  return { templateId: template.id, after: url && after ? { url, ratio: after, firstFrame } : null, beforeRatio }
}
