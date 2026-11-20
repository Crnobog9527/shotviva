import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'

import type { Locale } from '@/core/i18n'
import { PROVIDERS_CACHE_TAG } from '@/core/providers/cache-tag'
import { TEMPLATES_CACHE_TAG } from '@/core/templates'
import { CATALOGUE_LIFE, cachedWebTemplates } from '@/core/templates/cached-catalogue'
import { cachedCatalogueIndex } from '@/core/templates/cached-taxonomy'

import { isSlotTemplate, toCatalogueTemplate } from '../catalogue/catalogue-template'
import { pickerBrowse } from '../catalogue/picker-browse'
import type { HomeCatalogue } from './home-catalogue'

// The picker's whole payload, cached as one result under the same tags as its inputs, so every
// open does not rebuild and re-serialise the catalogue, and an admin save (which expires the
// templates tag) or a route change (providers) refreshes it with them. A failed read throws
// (cachedWebTemplates), so an outage is never cached.
export async function loadHomeCatalogue(locale: Locale): Promise<HomeCatalogue> {
  'use cache'
  cacheTag(TEMPLATES_CACHE_TAG, PROVIDERS_CACHE_TAG)
  cacheLife(CATALOGUE_LIFE)
  const [live, index] = await Promise.all([cachedWebTemplates(locale, true), cachedCatalogueIndex(locale)])
  const catalogue = live.map(toCatalogueTemplate)
  // Build placements over the same rows as the landing-page picker. It has always hidden
  // slot templates when opening cards and series, while preserving the shared category tree.
  return {
    templates: catalogue.filter((template) => !isSlotTemplate(template)),
    browse: pickerBrowse(index, catalogue, locale === 'zh'),
  }
}
