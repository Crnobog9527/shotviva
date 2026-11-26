import { unstable_rethrow } from 'next/navigation'
import { z } from 'zod'

import { LOCALES } from '@/core/i18n'
import { logger } from '@/core/logger'
import { cachedFeaturedBundles } from '@/core/templates/cached-bundles'
import { cachedWebCatalogue } from '@/core/templates/cached-catalogue'
import { HOME_CATALOGUE_CACHE_CONTROL, openingCandidates } from '@/modules/image'
import { bundleOpeningIds } from '@/site/content'

// Public on purpose: the home page's 精选组合 members the first-screen card may open on (Owner
// 2026-11-26), the same for every visitor and already shown on the page (names, covers, prices).
// No cookies are read; the CDN shares it a minute like /api/home/templates.
const localeSchema = z.enum(LOCALES)
const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET(request: Request) {
  const locale = localeSchema.safeParse(new URL(request.url).searchParams.get('locale'))
  if (!locale.success) return Response.json({ code: 'INVALID_INPUT' }, { status: 400, headers: NO_STORE })
  try {
    const [live, bundles] = await Promise.all([cachedWebCatalogue(locale.data), cachedFeaturedBundles(locale.data)])
    return Response.json({ templates: openingCandidates(live, bundleOpeningIds(live, bundles)) }, { headers: { 'Cache-Control': HOME_CATALOGUE_CACHE_CONTROL } })
  } catch (error) {
    unstable_rethrow(error)
    logger.error('home.opening_read_failed', { error })
    return Response.json({ code: 'INTERNAL' }, { status: 503, headers: NO_STORE })
  }
}
