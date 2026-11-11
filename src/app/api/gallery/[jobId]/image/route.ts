import { after, connection, type NextRequest } from 'next/server'

import { errorResponse } from '@/core/api-response'
import { isGalleryEnabled } from '@/core/gallery'
import { parseImageQuery, renderGalleryImage } from '@/core/gallery/image'
import { r2Store } from '@/core/storage'
import { site } from '@/site/site.config'

// Public on purpose: the gallery's image of an approved public work (ARCHITECTURE §9 第 3、9 条),
// scaled, watermarked for free works, WebP. Normally the copy made at approval; a work without
// one is rendered once and its copies written after the response. 404 for anything else and
// while the gallery is closed. The CDN keeps a copy for ten minutes at most, so a rejected or
// deleted work's image stops within that time; this side checks the work on every miss.
const CACHE = 'public, max-age=300, s-maxage=600'
// A 404 sits in the CDN for a minute, also while the gallery is closed: the switch is checked
// first (a cached read), so a closed gallery costs no work lookup, and the CDN absorbs repeats.
const NOT_FOUND = { status: 404, headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } }

export async function GET(request: NextRequest, { params }: RouteContext<'/api/gallery/[jobId]/image'>) {
  await connection()
  try {
    const width = parseImageQuery(request.nextUrl.searchParams)
    if (!width) return new Response(null, { status: 404 })
    if (!(await isGalleryEnabled(site))) return new Response(null, NOT_FOUND)
    const { jobId } = await params
    const body = await renderGalleryImage({ store: r2Store(), defer: (task) => after(task) }, jobId, width)
    if (!body) return new Response(null, NOT_FOUND)
    return new Response(body as BodyInit, { headers: { 'Content-Type': 'image/webp', 'Cache-Control': CACHE, 'X-Robots-Tag': 'noindex' } })
  } catch (error) {
    return errorResponse(error, 'gallery.image')
  }
}
