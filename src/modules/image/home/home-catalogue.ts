import type { Locale } from '@/core/i18n'
import type { LocalizedTemplate } from '@/core/templates'

import { toCatalogueTemplate, type CatalogueTemplate } from '../catalogue/catalogue-template'
import type { PickerBrowse } from '../catalogue/picker-browse'

export type HomeCatalogue = { templates: readonly CatalogueTemplate[]; browse: PickerBrowse | null }
// The picker's catalogue, fetched in this language the first time it is needed.
export type HomeCatalogueSource = { locale: Locale }

export const HOME_RAIL_SIZE = 4

// /api/home/templates: public catalogue data, the same for every visitor (no cookies are read).
// The CDN may keep it a minute and serve it a minute longer while it refetches; the result itself
// is cached under the templates tag (loadHomeCatalogue), so an admin save reaches the picker within
// about two minutes. Browsers always ask again.
export const HOME_CATALOGUE_CACHE_CONTROL = 'public, max-age=0, s-maxage=60, stale-while-revalidate=60'

const isHomeTemplate = (template: LocalizedTemplate) => !template.fields.images.slots?.length

// Keep four in catalogue order so the rail still has three alternatives after the visitor
// picks a template outside it. The opening template itself may be featured further down.
export function homePanelTemplates(live: readonly LocalizedTemplate[], defaultId: string | null) {
  const eligible = live.filter(isHomeTemplate)
  const first = eligible.slice(0, HOME_RAIL_SIZE)
  const opening = eligible.find((template) => template.id === defaultId) ?? first[0]
  const rows = opening && !first.includes(opening) ? [...first, opening] : first
  return { templates: rows.map((template) => panelSummary(toCatalogueTemplate(template))), opening }
}

// What the home panel reads of a text field is whether it is required (home-cta.ts): it asks for
// no text. Placeholders, help, examples, choices and folding groups are for the workspace form,
// which loads its own; the picker's catalogue, fetched on demand, has them in full.
function panelSummary(template: CatalogueTemplate): CatalogueTemplate {
  const summary = { ...template, copyFields: template.copyFields.map(({ key, label, type, required, maxLength, public: shown }) => ({ key, label, type, required, maxLength, public: shown })) }
  delete summary.groups
  return summary
}
