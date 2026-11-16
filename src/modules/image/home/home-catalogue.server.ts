import 'server-only'

import type { Locale } from '@/core/i18n'
import { cachedWebTemplates } from '@/core/templates/cached-catalogue'
import { cachedCatalogueIndex } from '@/core/templates/cached-taxonomy'

import { isSlotTemplate, toCatalogueTemplate } from '../catalogue/catalogue-template'
import { pickerBrowse } from '../catalogue/picker-browse'
import type { HomeCatalogue } from './home-catalogue'

export async function loadHomeCatalogue(locale: Locale): Promise<HomeCatalogue> {
  const [live, index] = await Promise.all([cachedWebTemplates(locale, true), cachedCatalogueIndex(locale)])
  const catalogue = live.map(toCatalogueTemplate)
  // Build placements over the same rows as the landing-page picker. It has always hidden
  // slot templates when opening cards and series, while preserving the shared category tree.
  return {
    templates: catalogue.filter((template) => !isSlotTemplate(template)),
    browse: pickerBrowse(index, catalogue, locale === 'zh'),
  }
}
