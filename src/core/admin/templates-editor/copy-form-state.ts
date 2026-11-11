import { COPY_DEFAULT_LENGTH, type CopyField, type CopyFieldType } from '@/core/templates/copy-fields'

import type { AdminTemplate } from '../templates/types'

// The 用户填写的字段 section of the template editor: one card per fields.copy entry with its
// English and Chinese text. On save the cards fold back into fields.copy and
// translations.zh.fields.<key>; the fields JSON box keeps images and aspect ratios only.

export type CopyOptionValue = { value: string; labelZh: string }

export type CopyFormValue = {
  key: string
  type: CopyFieldType
  label: string
  labelZh: string
  placeholder: string
  placeholderZh: string
  help: string
  helpZh: string
  required: boolean
  // Text boxes, parsed on save (blank min / max: no bound).
  maxLength: string
  min: string
  max: string
  options: CopyOptionValue[]
  public: boolean
}

export function emptyCopyField(type: CopyFieldType = 'short'): CopyFormValue {
  return {
    key: '', type, label: '', labelZh: '', placeholder: '', placeholderZh: '', help: '', helpZh: '', required: false,
    maxLength: String(COPY_DEFAULT_LENGTH[type]), min: '', max: '', public: false,
    options: type === 'select' ? [{ value: '', labelZh: '' }, { value: '', labelZh: '' }] : [],
  }
}

type ZhCopyText = { label?: string; placeholder?: string; help?: string; options?: Record<string, string | undefined> }

const text = (value: number | undefined) => (value === undefined ? '' : String(value))

function toCopyValue(field: CopyField, zh: ZhCopyText = {}): CopyFormValue {
  return {
    key: field.key, type: field.type ?? 'short', label: field.label, labelZh: zh.label ?? '',
    placeholder: field.placeholder ?? '', placeholderZh: zh.placeholder ?? '', help: field.help ?? '', helpZh: zh.help ?? '',
    required: field.required, maxLength: String(field.maxLength), min: text(field.min), max: text(field.max),
    options: (field.options ?? []).map((value) => ({ value, labelZh: zh.options?.[value] ?? '' })),
    public: field.public ?? false,
  }
}

export function toCopyValues(template: AdminTemplate): CopyFormValue[] {
  const zh = template.translations.zh?.fields ?? {}
  return template.fields.copy.map((field) => toCopyValue(field, zh[field.key]))
}

// The fields JSON box without what the cards own.
export function withoutCopy<T extends object>(value: T): Omit<T, 'copy'> {
  const rest = { ...value } as T & { copy?: unknown }
  delete rest.copy
  return rest
}

const trimmed = (value: string) => value.trim()
const optional = (key: string, value: string) => (trimmed(value) ? { [key]: trimmed(value) } : {})
// A number box: blank is none; anything else is sent as typed so the server's zod refuses junk.
const numberOf = (key: string, value: string) => (trimmed(value) ? { [key]: Number(trimmed(value)) } : {})

// fields.copy as the server validates it (templateFieldsSchema): English text only.
export function toCopyFields(fields: readonly CopyFormValue[]): Record<string, unknown>[] {
  return fields.map((field) => ({
    key: trimmed(field.key),
    type: field.type,
    label: trimmed(field.label),
    ...optional('placeholder', field.placeholder),
    ...optional('help', field.help),
    required: field.required,
    maxLength: field.type === 'select' ? COPY_DEFAULT_LENGTH.select : Number(trimmed(field.maxLength)),
    ...(field.type === 'select' ? { options: field.options.map((option) => trimmed(option.value)) } : {}),
    ...(field.type === 'number' ? { ...numberOf('min', field.min), ...numberOf('max', field.max) } : {}),
    public: field.public,
  }))
}

// translations.zh.fields.<key> for each card: only filled-in text (blank falls back to English).
export function toZhCopyText(fields: readonly CopyFormValue[]): Record<string, ZhCopyText> {
  return Object.fromEntries(
    fields.flatMap((field) => {
      const options = field.type === 'select'
        ? Object.fromEntries(field.options.filter((option) => trimmed(option.value) && trimmed(option.labelZh)).map((option) => [trimmed(option.value), trimmed(option.labelZh)]))
        : {}
      const entry = {
        ...optional('label', field.labelZh), ...optional('placeholder', field.placeholderZh), ...optional('help', field.helpZh),
        ...(Object.keys(options).length > 0 ? { options } : {}),
      }
      return Object.keys(entry).length > 0 ? [[trimmed(field.key), entry]] : []
    }),
  )
}

function choiceProblems(field: CopyFormValue): string[] {
  if (field.type !== 'select') return []
  const values = field.options.map((option) => trimmed(option.value))
  if (values.length < 2 || values.some((value) => !value)) return ['下拉选择至少要 2 个选项，且每个选项都要填英文']
  return new Set(values).size === values.length ? [] : ['选项不能重复']
}

function numberProblems(field: CopyFormValue): string[] {
  if (field.type !== 'number') return []
  const bad = [field.min, field.max].some((value) => trimmed(value) !== '' && !Number.isFinite(Number(trimmed(value))))
  return bad ? ['最小值、最大值要填数字'] : []
}

function cardProblems(field: CopyFormValue): string[] {
  return [
    ...(/^[a-z][a-z0-9_]*$/.test(trimmed(field.key)) ? [] : ['key 只能用小写字母、数字、下划线，且以字母开头']),
    ...(trimmed(field.label) ? [] : ['缺英文名称']),
    ...(field.type === 'select' || /^\d+$/.test(trimmed(field.maxLength)) ? [] : ['字数上限要填正整数']),
    ...choiceProblems(field),
    ...numberProblems(field),
  ]
}

// Said before the round trip, in the editor's language (DESIGN §7); the server checks again.
export function copySetupProblems(fields: readonly CopyFormValue[]): string[] {
  const keys = fields.map((field) => trimmed(field.key))
  const repeated = [...new Set(keys.filter((key, at) => key && keys.indexOf(key) !== at))].map((key) => `字段 key「${key}」重复了`)
  return [...repeated, ...fields.flatMap((field, index) => cardProblems(field).map((problem) => `${trimmed(field.key) || `第 ${index + 1} 个字段`}：${problem}`))]
}
