import type { Locale } from '@/core/i18n'
import type { LocalizedTemplate } from '@/core/templates'

import { toCatalogueTemplate, type CatalogueTemplate } from '../catalogue/catalogue-template'
import type { PickerBrowse } from '../catalogue/picker-browse'

export type HomeCatalogue = { templates: readonly CatalogueTemplate[]; browse: PickerBrowse | null }
export type HomeCatalogueSource = { locale: Locale } | { browse: PickerBrowse | null }

export const HOME_RAIL_SIZE = 4

const isHomeTemplate = (template: LocalizedTemplate) => !template.fields.images.slots?.length

// Keep four in catalogue order so the rail still has three alternatives after the visitor
// picks a template outside it. The opening template itself may be featured further down.
export function homePanelTemplates(live: readonly LocalizedTemplate[], defaultId: string | null) {
  const eligible = live.filter(isHomeTemplate)
  const first = eligible.slice(0, HOME_RAIL_SIZE)
  const opening = eligible.find((template) => template.id === defaultId) ?? first[0]
  const rows = opening && !first.includes(opening) ? [...first, opening] : first
  return { templates: rows.map(toCatalogueTemplate), opening }
}
