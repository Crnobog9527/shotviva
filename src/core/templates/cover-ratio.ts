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

type Covers = { id: string; coverAfterUrl: string | null; coverPosterUrl: string | null; coverBeforeUrl: string | null }

// The shapes of the covers the home generator opens on (its default template), both read in
// parallel; null without a template.
export async function openingCovers(template: Covers | undefined) {
  if (!template) return null
  const url = template.coverAfterUrl ?? template.coverPosterUrl
  const [after, beforeRatio] = await Promise.all([coverRatio(url), coverRatio(template.coverBeforeUrl)])
  return { templateId: template.id, after: url && after ? { url, ratio: after } : null, beforeRatio }
}
