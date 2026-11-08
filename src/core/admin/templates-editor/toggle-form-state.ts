import { toggleFragments, type ToggleField, type ToggleFragments } from '@/core/templates/toggles'

import type { AdminTemplate } from '../templates/types'

// The 开关 section of the template editor (T89): one card per toggle with its English and
// Chinese text and its two private prompt fragments. On save the cards are folded back into
// fields.toggles, translations.zh.fields.<key> and model_params.toggles; the JSON boxes for
// fields and model params show everything else.

export type ConfirmText = { title: string; body: string; checkbox: string; accept: string }

export type ToggleFormValue = {
  key: string
  label: string
  hint: string
  labelZh: string
  hintZh: string
  // Ask before turning on (the confirm dialog); its text in both languages.
  confirm: boolean
  confirmEn: ConfirmText
  confirmZh: ConfirmText
  // model_params.toggles.<key>: the private text each state puts at {{key}}.
  on: string
  off: string
}

const emptyConfirm = (): ConfirmText => ({ title: '', body: '', checkbox: '', accept: '' })

export function emptyToggle(): ToggleFormValue {
  return { key: '', label: '', hint: '', labelZh: '', hintZh: '', confirm: false, confirmEn: emptyConfirm(), confirmZh: emptyConfirm(), on: '', off: '' }
}

type ZhToggleText = { label?: string; hint?: string; confirm?: Partial<ConfirmText> }

const confirmOf = (text: Partial<ConfirmText> | undefined): ConfirmText => ({
  title: text?.title ?? '',
  body: text?.body ?? '',
  checkbox: text?.checkbox ?? '',
  accept: text?.accept ?? '',
})

function toToggleValue(toggle: ToggleField, zh: ZhToggleText = {}, fragments: ToggleFragments): ToggleFormValue {
  const own = fragments[toggle.key] ?? { on: '', off: '' }
  return {
    key: toggle.key,
    label: toggle.label,
    hint: toggle.hint ?? '',
    labelZh: zh.label ?? '',
    hintZh: zh.hint ?? '',
    confirm: toggle.confirm !== undefined,
    confirmEn: confirmOf(toggle.confirm),
    confirmZh: confirmOf(zh.confirm),
    on: own.on,
    off: own.off,
  }
}

export function toToggleValues(template: AdminTemplate): ToggleFormValue[] {
  const fragments = toggleFragments(template.prompt?.modelParams ?? {})
  const zh = template.translations.zh?.fields ?? {}
  return (template.fields.toggles ?? []).map((toggle) => toToggleValue(toggle, zh[toggle.key], fragments))
}

// The JSON boxes without what the 开关 cards own.
export function withoutToggles<T extends object>(value: T): Omit<T, 'toggles'> {
  const rest = { ...value } as T & { toggles?: unknown }
  delete rest.toggles
  return rest
}

const trimmed = (text: string) => text.trim()

function trimConfirm(text: ConfirmText): ConfirmText {
  return { title: trimmed(text.title), body: trimmed(text.body), checkbox: trimmed(text.checkbox), accept: trimmed(text.accept) }
}

// fields.toggles: English text, default off, the confirm dialog only when asked for. The server
// validates every field again (templateFieldsSchema).
export function toToggleFields(toggles: readonly ToggleFormValue[]): ToggleField[] {
  return toggles.map((toggle) => ({
    key: trimmed(toggle.key),
    label: trimmed(toggle.label),
    ...(trimmed(toggle.hint) ? { hint: trimmed(toggle.hint) } : {}),
    default: false,
    ...(toggle.confirm ? { confirm: trimConfirm(toggle.confirmEn) } : {}),
  }))
}

// model_params.toggles; none at all when the template has no toggles.
export function toFragments(toggles: readonly ToggleFormValue[]): { toggles?: ToggleFragments } {
  if (toggles.length === 0) return {}
  return { toggles: Object.fromEntries(toggles.map((toggle) => [trimmed(toggle.key), { on: toggle.on, off: toggle.off }])) }
}

const filled = (entries: [string, string][]) => Object.fromEntries(entries.filter(([, text]) => text.trim()).map(([k, text]) => [k, text.trim()]))

// translations.zh.fields.<key> for each toggle: only filled-in text (blank falls back to English).
export function toZhToggleText(toggles: readonly ToggleFormValue[]): Record<string, ZhToggleText> {
  return Object.fromEntries(
    toggles.flatMap((toggle) => {
      const own = filled([
        ['label', toggle.labelZh],
        ['hint', toggle.hintZh],
      ])
      const confirm = toggle.confirm ? filled(Object.entries(toggle.confirmZh)) : {}
      const entry = { ...own, ...(Object.keys(confirm).length > 0 ? { confirm } : {}) }
      return Object.keys(entry).length > 0 ? [[trimmed(toggle.key), entry]] : []
    }),
  )
}
