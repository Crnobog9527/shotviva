import { openableTemplates } from './catalogue-filter'
import type { CatalogueTemplate } from './catalogue-template'
import type { CatalogueView } from './catalogue-view'
import { slimBrowse, type PickerBrowse } from './picker-browse'

export type CatalogueForm = Pick<CatalogueTemplate, 'copyFields' | 'toggles' | 'imageSlots' | 'groups'>
export type CatalogueForms = Record<string, CatalogueForm>
export type CataloguePayload = { browse: PickerBrowse; templates: CatalogueTemplate[] }

export function catalogueForm({ copyFields, toggles, imageSlots, groups }: CatalogueTemplate): CatalogueForm {
  return { copyFields, toggles, imageSlots, groups }
}

function templateSummary(template: CatalogueTemplate): CatalogueTemplate {
  const { copyFields, toggles, imageSlots, groups, ...summary } = template
  const defer = !template.poster && [copyFields, toggles, imageSlots, groups].some((fields) => Boolean(fields?.length))
  return {
    ...summary, copyFields: [], toggles: [],
    ...(defer ? { formDeferred: true } : {}),
    ...(imageSlots?.length ? { hasDeferredSlots: true } : {}),
    ...(groups?.length ? { hasDeferredGroups: true } : {}),
  }
}

export function toCataloguePayload(view: CatalogueView): CataloguePayload {
  return {
    browse: { ...slimBrowse(view), filters: view.filters },
    templates: openableTemplates(view.entries).map(templateSummary),
  }
}
