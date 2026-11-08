import type { Locale } from '../i18n/locales'
import { localizeCategory, type LocalizedCategory } from './categories'
import { withLocaleCover } from './cover-locales'
import type { TemplateTranslation } from './schema'
import type { ToggleField } from './toggles'
import type { Template } from './types'

// A template as shown in one language: the translated name, description and copy-field labels
// where templates.translations has them, the English text where it does not, never blank
// (ARCHITECTURE §5, LAUNCH §7.6 #5), and the cover that language's pages show (§8.3 「封面按语言适配」,
// T87): every cover field is the resolved one. Prompts are not touched: they stay English.
export type LocalizedTemplate = Template & {
  // The one-liner in the page's language: `description` on English pages, the translation
  // elsewhere, falling back to `description` (T52); null when neither is filled in.
  description: string | null
  // Its category's name, intro and card style in the page's language (T75).
  categoryView: LocalizedCategory
}

type ConfirmText = NonNullable<ToggleField['confirm']>

function localizeConfirm(english: ConfirmText, own: Partial<ConfirmText> = {}): ConfirmText {
  return {
    title: own.title || english.title,
    body: own.body || english.body,
    checkbox: own.checkbox || english.checkbox,
    accept: own.accept || english.accept,
  }
}

// A toggle's label, hint and confirm dialog (T89), line by line, falling back to English.
function localizeToggle(toggle: ToggleField, text: TemplateTranslation): ToggleField {
  const own = text.fields?.[toggle.key] ?? {}
  const hint = own.hint || toggle.hint
  const confirm = toggle.confirm ? { confirm: localizeConfirm(toggle.confirm, own.confirm) } : {}
  return { ...toggle, label: own.label || toggle.label, ...(hint ? { hint } : {}), ...confirm }
}

export function localizeTemplate(template: Template, locale: Locale): LocalizedTemplate {
  const categoryView = localizeCategory(template.categoryInfo, locale)
  const shown = withLocaleCover(template, locale)
  const text = locale === 'en' ? undefined : template.translations[locale]
  if (!text) return { ...shown, categoryView }
  const copy = template.fields.copy.map((field) => {
    const own = text.fields?.[field.key]
    return { ...field, label: own?.label || field.label, ...(own?.placeholder ? { placeholder: own.placeholder } : {}) }
  })
  return {
    ...shown,
    categoryView,
    name: text.name || template.name,
    description: text.description || template.description,
    fields: { ...template.fields, copy, toggles: template.fields.toggles.map((toggle) => localizeToggle(toggle, text)) },
  }
}
