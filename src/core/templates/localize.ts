import type { Locale } from '../i18n/locales'
import { localizeCategory, type LocalizedCategory } from './categories'
import { withLocaleCover } from './cover-locales'
import type { CopyField } from './copy-fields'
import type { TemplateFields, TemplateTranslation } from './schema'
import type { ToggleField } from './toggles'
import type { Template } from './types'

// A template as shown in one language: the translated name, description and copy-field labels
// where templates.translations has them, the English text where it does not, never blank
// (ARCHITECTURE §5, LAUNCH §7.6 #5), and the cover that language's pages show (§8.3 「封面按语言适配」,
// T87): every cover field is the resolved one. Prompts are not touched: they stay English.
// A copy field in the page's language. A choice field's options stay the English values (what is
// validated and sent to the model); optionLabels says how to show each one, English when the
// language has no label for it.
export type LocalizedCopyField = CopyField & { optionLabels?: Record<string, string> }

export type LocalizedTemplate = Omit<Template, 'fields'> & {
  fields: Omit<TemplateFields, 'copy'> & { copy: LocalizedCopyField[] }
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

// Label, placeholder, help and option labels, each falling back to English.
type OwnCopyText = NonNullable<TemplateTranslation['fields']>[string]

function optionLabels(field: CopyField, own: OwnCopyText): Pick<LocalizedCopyField, 'optionLabels'> {
  if (field.type !== 'select') return {}
  return { optionLabels: Object.fromEntries((field.options ?? []).map((value) => [value, own.options?.[value] || value])) }
}

function localizeCopy(field: CopyField, text: TemplateTranslation | undefined): LocalizedCopyField {
  const own: OwnCopyText = text?.fields?.[field.key] ?? {}
  const placeholder = own.placeholder || field.placeholder
  const help = own.help || field.help
  return { ...field, label: own.label || field.label, ...(placeholder ? { placeholder } : {}), ...(help ? { help } : {}), ...optionLabels(field, own) }
}

export function localizeTemplate(template: Template, locale: Locale): LocalizedTemplate {
  const categoryView = localizeCategory(template.categoryInfo, locale)
  const shown = withLocaleCover(template, locale)
  const text = locale === 'en' ? undefined : template.translations[locale]
  const copy = template.fields.copy.map((field) => localizeCopy(field, text))
  if (!text) return { ...shown, categoryView, fields: { ...template.fields, copy } }
  return {
    ...shown,
    categoryView,
    name: text.name || template.name,
    description: text.description || template.description,
    fields: { ...template.fields, copy, toggles: template.fields.toggles.map((toggle) => localizeToggle(toggle, text)) },
  }
}
