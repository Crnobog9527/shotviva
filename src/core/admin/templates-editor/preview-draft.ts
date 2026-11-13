import { RESOLUTIONS } from '@/core/templates/output-options'
import { templateFieldsSchema, templateTranslationsSchema } from '@/core/templates/schema'
import type { Template } from '@/core/templates/types'

import type { AdminTemplate } from '../templates/types'
import type { CategoryOption } from './category-options'
import { toCopyFields, withoutCopy } from './copy-form-state'
import { toTranslations, type TemplateFormValues } from './form-state'
import { toImages } from './slot-form-state'
import { toToggleFields, withoutToggles } from './toggle-form-state'

// nameEn: the series' English name, for the English preview (older option lists may lack it).
export type PreviewSeries = { name: string; nameEn?: string; members: Template[] }
// stale: the field cards or the fields JSON do not parse yet, so the saved fields are shown.
export type PreviewDraft = { template: Template; series: PreviewSeries | null; stale: boolean }

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

// The fields the user's form is drawn from, folded the way buildPayload folds them; null while
// the JSON or a card is not valid yet.
function draftFields(values: TemplateFormValues): Template['fields'] | null {
  const json = parseJson(values.fieldsJson)
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return null
  const rest = withoutCopy(withoutToggles(json as Record<string, unknown>))
  const parsed = templateFieldsSchema.safeParse({
    ...rest, images: toImages(values.imageSlots, (rest as { images?: unknown }).images),
    copy: toCopyFields(values.copyFields), toggles: toToggleFields(values.toggles),
  })
  return parsed.success ? parsed.data : null
}

// A blank or unparsable price box keeps the saved price for that resolution.
function draftCredits(values: TemplateFormValues, saved: Template['creditsCost']): Template['creditsCost'] {
  const credits = { ...saved }
  for (const resolution of RESOLUTIONS) {
    const text = values.credits[resolution].trim()
    if (/^\d+$/.test(text) && Number(text) > 0) credits[resolution] = Number(text)
  }
  return credits
}

function draftTranslations(values: TemplateFormValues, saved: Template['translations']): Template['translations'] {
  const parsed = templateTranslationsSchema.safeParse(toTranslations(values.zh, values.copyFields, values.toggles, values.imageSlots))
  return parsed.success ? parsed.data : saved
}

// templates.category_key is the picked category's root (the sub-category is its own column): the
// dialog names the root, so a move to another root changes that name.
function draftRoot(values: TemplateFormValues, base: AdminTemplate, categories: readonly CategoryOption[]) {
  const byKey = new Map(categories.map(category => [category.key, category]))
  let at = byKey.get(values.category)
  for (let hops = 0; at?.parentId && hops < 5; hops++) at = byKey.get(at.parentId)
  if (!at || at.key === base.categoryInfo.key) return { category: base.category, categoryInfo: base.categoryInfo }
  return { category: at.key, categoryInfo: { ...base.categoryInfo, key: at.key, nameZh: at.nameZh, nameEn: at.nameEn } }
}

// The saved template with the form's unsaved values over it: what the user would see once saved.
// Covers and image options stay the saved ones (covers save on upload; options come from the
// server's model read).
export function draftTemplate(values: TemplateFormValues, base: AdminTemplate, categories: readonly CategoryOption[]): { template: Template; stale: boolean } {
  const fields = draftFields(values)
  return {
    stale: fields === null,
    template: {
      ...base,
      name: values.name.trim() || base.name,
      description: values.description.trim() || null,
      ...draftRoot(values, base, categories),
      fields: fields ?? base.fields,
      quality: values.quality,
      creditsCost: draftCredits(values, base.creditsCost),
      translations: draftTranslations(values, base.translations),
    },
  }
}

// The series panel's members as users see them (published ones, in series order) with this
// template's draft in its place, or at the end when the form just moved it into the series.
export function draftSeries(draft: Template, seriesId: string | null, all: readonly AdminTemplate[], names: readonly { id: string; nameZh: string; nameEn?: string }[]): PreviewSeries | null {
  if (!seriesId) return null
  const option = names.find(item => item.id === seriesId)
  const name = option?.nameZh ?? ''
  const order = (template: AdminTemplate) => template.seriesSortOrder ?? 0
  const others = all
    .filter(other => other.seriesId === seriesId && other.isActive && other.id !== draft.id)
    .sort((a, b) => order(a) - order(b))
  const own = all.find(other => other.id === draft.id)
  const at = own?.seriesId === seriesId ? others.filter(other => order(other) < order(own)).length : others.length
  const members: Template[] = [...others]
  members.splice(at, 0, draft)
  return { name, ...(option?.nameEn ? { nameEn: option.nameEn } : {}), members }
}

export function previewDraft(values: TemplateFormValues, base: AdminTemplate, context: {
  categories: readonly CategoryOption[]; templates: readonly AdminTemplate[]; series: readonly { id: string; nameZh: string; nameEn?: string }[]
}): PreviewDraft {
  const { template, stale } = draftTemplate(values, base, context.categories)
  return { template, stale, series: draftSeries(template, values.seriesId, context.templates, context.series) }
}
