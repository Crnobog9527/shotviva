import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'

import type { Locale } from '@/core/i18n'
import { PROVIDERS_CACHE_TAG } from '@/core/providers/cache-tag'
import { TEMPLATES_CACHE_TAG, type CatalogueIndex, type LocalizedTemplate } from '@/core/templates'
import { CATALOGUE_LIFE, cachedWebTemplates } from '@/core/templates/cached-catalogue'
import { cachedCatalogueIndex } from '@/core/templates/cached-taxonomy'

import { isSlotTemplate, toCatalogueTemplate } from '../catalogue/catalogue-template'
import { pickerBrowse } from '../catalogue/picker-browse'
import type { HomeCatalogue } from './home-catalogue'

// Build placements over the same rows as the landing-page picker. It has always hidden slot
// templates when opening cards and series, while preserving the shared category tree.
export function assembleHomeCatalogue(live: readonly LocalizedTemplate[], index: CatalogueIndex | null, locale: Locale): HomeCatalogue {
  const catalogue = live.map(toCatalogueTemplate)
  return {
    templates: catalogue.filter((template) => !isSlotTemplate(template)),
    browse: pickerBrowse(index, catalogue, locale === 'zh'),
  }
}

// The picker's whole payload, cached as one result under the same tags as its inputs, so every
// open does not rebuild and re-serialise the catalogue, and an admin save (templates tag) or a
// route change (providers) refreshes it. Only a complete result is stored: a failed template
// read throws (cachedWebTemplates), and a failed taxonomy read (null index, which its own cache
// keeps for a minute only) throws here, since this entry's hour-long life would otherwise keep
// the picker on its flat list long after the outage.
export async function cachedHomeCatalogue(locale: Locale): Promise<HomeCatalogue> {
  'use cache'
  cacheTag(TEMPLATES_CACHE_TAG, PROVIDERS_CACHE_TAG)
  cacheLife(CATALOGUE_LIFE)
  const [live, index] = await Promise.all([cachedWebTemplates(locale, true), cachedCatalogueIndex(locale)])
  if (!index) throw new Error('Catalogue index unavailable')
  return assembleHomeCatalogue(live, index, locale)
}

type Reads = {
  cached: (locale: Locale) => Promise<HomeCatalogue>
  templates: (locale: Locale) => Promise<readonly LocalizedTemplate[]>
  index: (locale: Locale) => Promise<CatalogueIndex | null>
}
const READS: Reads = { cached: cachedHomeCatalogue, templates: (locale) => cachedWebTemplates(locale, true), index: cachedCatalogueIndex }

// When the cached entry cannot be made, the picker is built for this request from the inputs'
// own caches: with the taxonomy down it opens on its flat list by category (browse: null, which
// the route sends uncached), and a failed template read still throws. The error is not told
// apart by type: what a 'use cache' function throws reaches the caller serialised.
export async function loadHomeCatalogue(locale: Locale, reads: Reads = READS): Promise<HomeCatalogue> {
  try {
    return await reads.cached(locale)
  } catch {
    const [live, index] = await Promise.all([reads.templates(locale), reads.index(locale)])
    return assembleHomeCatalogue(live, index, locale)
  }
}
