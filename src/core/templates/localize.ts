import type { Locale } from '../i18n/locales'
import { localizeCategory, type LocalizedCategory } from './categories'
import type { Template } from './types'

// A template as shown in one language: the translated name, description and copy-field labels
// where templates.translations has them, the English text where it does not, never blank
// (ARCHITECTURE §5, LAUNCH §7.6 #5). Prompts are not touched: they stay English.
export type LocalizedTemplate = Template & {
  // The one-liner in the page's language: `description` on English pages, the translation
  // elsewhere, falling back to `description` (T52); null when neither is filled in.
  description: string | null
  // Its category's name, intro and card style in the page's language (T75).
  categoryView: LocalizedCategory
}

export function localizeTemplate(template: Template, locale: Locale): LocalizedTemplate {
  const categoryView = localizeCategory(template.categoryInfo, locale)
  const text = locale === 'en' ? undefined : template.translations[locale]
  if (!text) return { ...template, categoryView }
  const copy = template.fields.copy.map((field) => {
    const own = text.fields?.[field.key]
    return { ...field, label: own?.label || field.label, ...(own?.placeholder ? { placeholder: own.placeholder } : {}) }
  })
  return {
    ...template,
    categoryView,
    name: text.name || template.name,
    description: text.description || template.description,
    fields: { ...template.fields, copy },
  }
}
