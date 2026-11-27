import { unstable_rethrow } from 'next/navigation'
import { z } from 'zod'

import { LOCALES } from '@/core/i18n'
import { logger } from '@/core/logger'
import { CATALOGUE_CDN_TAG_HEADER } from '@/core/templates/cdn-cache-tag'
import { cachedFeaturedBundles } from '@/core/templates/cached-bundles'
import { cachedWebCatalogue } from '@/core/templates/cached-catalogue'
import { cachedPublicSeries } from '@/core/templates/public-series'
import { HOME_CATALOGUE_CACHE_CONTROL } from '@/modules/image'
import { bundleLayerPairs, seriesLayerPairs } from '@/site/content'

const localeSchema = z.enum(LOCALES)
const NO_STORE = { 'Cache-Control': 'no-store' }

// The series cards' later pairs (core/content/blocks/series-layers-source.ts): cover addresses
// the public pages showed in their own HTML until 2026-11-21, from the same two cached public
// reads those pages draw from. The same for every visitor (no cookies read), so the CDN shares it
// as briefly as the home picker's catalogue.
export async function GET(request: Request) {
  const locale = localeSchema.safeParse(new URL(request.url).searchParams.get('locale'))
  if (!locale.success) return Response.json({ code: 'INVALID_INPUT' }, { status: 400, headers: NO_STORE })

  try {
    const [live, series, bundles] = await Promise.all([cachedWebCatalogue(locale.data), cachedPublicSeries(locale.data), cachedFeaturedBundles(locale.data)])
    // Bundle cards (精选组合) play the same way, under their own keys.
    const layers = { ...seriesLayerPairs(live, series), ...bundleLayerPairs(live, bundles) }
    // An empty answer is what a failed read degrades to (both reads fall back to empty): never shared.
    return Response.json(layers, { headers: Object.keys(layers).length > 0 ? { 'Cache-Control': HOME_CATALOGUE_CACHE_CONTROL, ...CATALOGUE_CDN_TAG_HEADER } : NO_STORE })
  } catch (error) {
    unstable_rethrow(error)
    logger.error('home.series_layers_read_failed', { error })
    return Response.json({ code: 'INTERNAL' }, { status: 503, headers: NO_STORE })
  }
}
