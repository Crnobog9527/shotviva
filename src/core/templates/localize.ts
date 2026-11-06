import type { Locale } from '../i18n/locales'
import type { Template } from './types'

// A template as shown in one language: the translated name and copy-field labels where
// templates.translations has them, the English text where it does not, never blank
// (ARCHITECTURE §5, LAUNCH §7.6 #5). Prompts are not touched: they stay English.
export type LocalizedTemplate = Template & {
  // Translated one-line description, when one exists; English templates have none yet.
  description: string | null
}

export function localizeTemplate(template: Template, locale: Locale): LocalizedTemplate {
  const text = locale === 'en' ? undefined : template.translations[locale]
  if (!text) return { ...template, description: null }
  const copy = template.fields.copy.map((field) => {
    const own = text.fields?.[field.key]
    return { ...field, label: own?.label || field.label, ...(own?.placeholder ? { placeholder: own.placeholder } : {}) }
  })
  return {
    ...template,
    name: text.name || template.name,
    description: text.description || null,
    fields: { ...template.fields, copy },
  }
}
