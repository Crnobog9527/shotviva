import { FEATURES_CACHE_TAG } from '../features/read'
import { PROVIDERS_CACHE_TAG } from '../providers/cache-tag'
import { TEMPLATES_CACHE_TAG } from './cache'

// Vercel's CDN keeps public catalogue answers (Create's catalogue file, the home picker's lists)
// under the same tags as the Next cache behind them. On Next 16, updateTag(tag) also deletes the
// CDN entries carrying that tag, so an admin save (template rename, category order, featured
// list, a provider or feature switch) reaches the next request instead of waiting out the CDN's
// minute plus its stale-while-revalidate window (template rename not shown after two refreshes on
// the test site, PR #963 validation, 2026-11-27). Without this header the CDN never hears of a save.
export const CATALOGUE_CDN_TAGS = [TEMPLATES_CACHE_TAG, PROVIDERS_CACHE_TAG, FEATURES_CACHE_TAG].join(',')
export const CATALOGUE_CDN_TAG_HEADER = { 'Vercel-Cache-Tag': CATALOGUE_CDN_TAGS } as const
