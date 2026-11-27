import { unstable_rethrow } from 'next/navigation'
import { z } from 'zod'

import { LOCALES } from '@/core/i18n'
import { logger } from '@/core/logger'
import { CATALOGUE_CDN_TAG_HEADER } from '@/core/templates/cdn-cache-tag'
import { HOME_CATALOGUE_CACHE_CONTROL, loadHomeCatalogue } from '@/modules/image'

const localeSchema = z.enum(LOCALES)
const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET(request: Request) {
  const locale = localeSchema.safeParse(new URL(request.url).searchParams.get('locale'))
  if (!locale.success) return Response.json({ code: 'INVALID_INPUT' }, { status: 400, headers: NO_STORE })

  try {
    const catalogue = await loadHomeCatalogue(locale.data)
    // Without the category index (taxonomy read failed) it is a stand-in: never shared.
    return Response.json(catalogue, { headers: catalogue.browse ? { 'Cache-Control': HOME_CATALOGUE_CACHE_CONTROL, ...CATALOGUE_CDN_TAG_HEADER } : NO_STORE })
  } catch (error) {
    unstable_rethrow(error)
    logger.error('home.catalogue_read_failed', { error })
    return Response.json({ code: 'INTERNAL' }, { status: 503, headers: NO_STORE })
  }
}
