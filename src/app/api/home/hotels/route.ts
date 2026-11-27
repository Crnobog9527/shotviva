import { unstable_rethrow } from 'next/navigation'
import { z } from 'zod'

import { LOCALES } from '@/core/i18n'
import { logger } from '@/core/logger'
import { CATALOGUE_CDN_TAG_HEADER } from '@/core/templates/cdn-cache-tag'
import { cachedWebCatalogue } from '@/core/templates/cached-catalogue'
import { HOME_CATALOGUE_CACHE_CONTROL } from '@/modules/image'
import { hotelViewerPairs } from '@/site/content'

const localeSchema = z.enum(LOCALES)
const NO_STORE = { 'Cache-Control': 'no-store' }

// The home hotels viewer's full-size pictures (core/content/blocks/hotel-case-viewer.tsx), asked
// for on its first open: each case's template covers while live, else the block's own files, from
// the same cached catalogue the page was drawn from. The same for every visitor (no cookies read),
// so the CDN shares it as briefly as the series layers; an answer drawn without the catalogue (a
// failed read degrades to empty) is the fallback pictures and is never shared.
export async function GET(request: Request) {
  const locale = localeSchema.safeParse(new URL(request.url).searchParams.get('locale'))
  if (!locale.success) return Response.json({ code: 'INVALID_INPUT' }, { status: 400, headers: NO_STORE })

  try {
    const live = await cachedWebCatalogue(locale.data)
    return Response.json(hotelViewerPairs(locale.data, live), { headers: live.length > 0 ? { 'Cache-Control': HOME_CATALOGUE_CACHE_CONTROL, ...CATALOGUE_CDN_TAG_HEADER } : NO_STORE })
  } catch (error) {
    unstable_rethrow(error)
    logger.error('home.hotel_pairs_read_failed', { error })
    return Response.json({ code: 'INTERNAL' }, { status: 503, headers: NO_STORE })
  }
}
