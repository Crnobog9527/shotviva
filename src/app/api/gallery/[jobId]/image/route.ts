import { connection, type NextRequest } from 'next/server'

import { errorResponse } from '@/core/api-response'
import { isGalleryEnabled } from '@/core/gallery'
import { parseWidth, renderGalleryImage } from '@/core/gallery/image'
import { r2Store } from '@/core/storage'
import { site } from '@/site/site.config'

// Public on purpose: the gallery's image of an approved public work (ARCHITECTURE §9 第 3、9 条),
// scaled, watermarked for free works, WebP. 404 for anything else and while the gallery is
// closed. The CDN keeps a copy for ten minutes at most, so a rejected or deleted work's image
// stops within that time; this side checks the work on every miss.
const CACHE = 'public, max-age=300, s-maxage=600'

export async function GET(request: NextRequest, { params }: RouteContext<'/api/gallery/[jobId]/image'>) {
  await connection()
  try {
    if (!(await isGalleryEnabled(site))) return new Response(null, { status: 404 })
    const { jobId } = await params
    const body = await renderGalleryImage(r2Store(), jobId, parseWidth(request.nextUrl.searchParams.get('w')))
    if (!body) return new Response(null, { status: 404, headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } })
    return new Response(body as BodyInit, { headers: { 'Content-Type': 'image/webp', 'Cache-Control': CACHE, 'X-Robots-Tag': 'noindex' } })
  } catch (error) {
    return errorResponse(error, 'gallery.image')
  }
}
