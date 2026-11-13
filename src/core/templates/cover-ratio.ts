import 'server-only'

import { cacheLife } from 'next/cache'

import { logger } from '../logger'
import { isCoverUrl } from '../ui/cover-image'
import { registerFirstFrame } from '../ui/first-frame-store'
import { CATALOGUE_LIFE } from './cached-catalogue'

// The home generator's preview reads the opening template's covers on the server (Owner
// 2026-11-12, 方案 B): each cover's shape, so the frame is drawn in its final shape with no crop
// and no layout shift, and the result cover's first frame (below). The URLs come from admin, so
// the read is fenced: covers on the assets base only (the images.remotePatterns rule), 5 s, no
// redirects, 10 MB and 40 MP at most. Any failure gives no shape (the frame's default, contained)
// and is kept an hour, so one bad cover does not re-render every page each minute.
const TIMEOUT_MS = 5_000
const MAX_BYTES = 10 * 1024 * 1024
const MAX_PIXELS = 40_000_000
// The first frame: the cover at 384 px (at least the phone frame's CSS width, so the browser
// counts this paint as the picture's, like the hero's frames, scripts/first-frames.ts), AVIF at
// quality 30 (about 5 KB), as a data: URI the HTML carries. On a phone the preview sits under the
// hero and can be the first screen's largest picture; with its frame in the document it paints
// with the page instead of a request later (measured on /zh: +0.5–0.8 s without it).
const FRAME_WIDTH = 384

export type CoverPreview = { ratio: number | null; firstFrame: string | null }
const NONE: CoverPreview = { ratio: null, firstFrame: null }

export type CoverDeps = { fetch: typeof fetch; isCover(url: string): boolean }
const defaultDeps: CoverDeps = { fetch: (input, init) => fetch(input, init), isCover: (url) => isCoverUrl(url) }

async function download(url: string, deps: CoverDeps): Promise<Buffer> {
  if (!deps.isCover(url)) throw new Error('not a cover on the assets base')
  const response = await deps.fetch(url, { redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) })
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (!response.ok || declared > MAX_BYTES) {
    await response.body?.cancel()
    throw new Error(response.ok ? 'cover too large' : `HTTP ${response.status}`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length > MAX_BYTES) throw new Error('cover too large')
  return bytes
}

// Width / height as the picture is shown: EXIF orientations 5–8 turn it a quarter.
export async function readCover(url: string | null, withFrame: boolean, deps: CoverDeps = defaultDeps): Promise<CoverPreview> {
  if (!url) return NONE
  const input = await download(url, deps)
  const { default: sharp } = await import('sharp')
  const meta = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata()
  if (!meta.width || !meta.height) throw new Error('unreadable cover')
  const turned = (meta.orientation ?? 1) >= 5
  const ratio = turned ? meta.height / meta.width : meta.width / meta.height
  if (!withFrame) return { ratio, firstFrame: null }
  const frame = await sharp(input, { limitInputPixels: MAX_PIXELS }).rotate().resize({ width: FRAME_WIDTH }).avif({ quality: 30, effort: 4 }).toBuffer()
  return { ratio, firstFrame: `data:image/avif;base64,${frame.toString('base64')}` }
}

// The cached body, apart for tests.
export async function previewOrNone(url: string | null, withFrame: boolean, deps: CoverDeps = defaultDeps): Promise<CoverPreview> {
  try {
    const preview = await readCover(url, withFrame, deps)
    // A cover URL carries a content hash (ARCHITECTURE §8.3): it never changes its picture.
    cacheLife('max')
    return preview
  } catch (error) {
    cacheLife(CATALOGUE_LIFE)
    logger.warn('templates.cover_preview_failed', { error })
    return NONE
  }
}

export async function coverPreview(url: string | null, withFrame: boolean): Promise<CoverPreview> {
  'use cache'
  return previewOrNone(url, withFrame)
}

type Covers = { id: string; coverAfterUrl: string | null; coverPosterUrl: string | null; coverBeforeUrl: string | null }

// The covers the home generator opens on (its default template): the result's shape and first
// frame (one download), the phone photo's shape; null without a template.
export async function openingCovers(template: Covers | undefined) {
  if (!template) return null
  const url = template.coverAfterUrl ?? template.coverPosterUrl
  const [after, before] = await Promise.all([coverPreview(url, true), coverPreview(template.coverBeforeUrl, false)])
  // The frame itself stays on the server (ui/first-frame-store.ts); the page is told only that
  // there is one, so its bytes are in the HTML once (the <img>) and not again in the page data.
  const framed = url ? registerFirstFrame(url, after.firstFrame) : false
  return { templateId: template.id, after: url && after.ratio ? { url, ratio: after.ratio, firstFrame: framed } : null, beforeRatio: before.ratio }
}
