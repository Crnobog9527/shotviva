import type { Locale } from '../i18n/locales'
import type { Template } from './types'

// A template as shown in one language: the translated name, description and copy-field labels
// where templates.translations has them, the English text where it does not, never blank
// (ARCHITECTURE §5, LAUNCH §7.6 #5). Prompts are not touched: they stay English.
export type LocalizedTemplate = Template & {
  // The one-liner in the page's language: `description` on English pages, the translation
  // elsewhere, falling back to `description` (T52); null when neither is filled in.
  description: string | null
}

export function localizeTemplate(template: Template, locale: Locale): LocalizedTemplate {
  const text = locale === 'en' ? undefined : template.translations[locale]
  if (!text) return template
  const copy = template.fields.copy.map((field) => {
    const own = text.fields?.[field.key]
    return { ...field, label: own?.label || field.label, ...(own?.placeholder ? { placeholder: own.placeholder } : {}) }
  })
  return {
    ...template,
    name: text.name || template.name,
    description: text.description || template.description,
    fields: { ...template.fields, copy },
  }
}
