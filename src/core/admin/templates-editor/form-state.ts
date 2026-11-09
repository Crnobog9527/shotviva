import type { StyleRef } from '@/core/templates/style-refs'
import { MISSING_COST, floorGuidance } from '@/core/templates/provider-pricing'
import { RESOLUTIONS, type Resolution } from '@/core/templates/output-options'
import { approvedCredit, type CreditsFloor, type TemplateQuality } from '@/core/templates/pricing'
import { toggleSetupProblems } from '@/core/templates/toggles'

import type { AdminTemplate, SaveTemplatePayload } from '../templates/types'
import { toFragments, toToggleFields, toToggleValues, toZhToggleText, withoutToggles, type ToggleFormValue } from './toggle-form-state'

export type TemplateFormValues = {
  id: string
  module: 'image' | 'video'
  name: string
  // English one-liner (T52); blank saves as none.
  description: string
  category: string
  quality: TemplateQuality
  // One text box per resolution; parsed on save.
  credits: Record<Resolution, string>
  visibleWeb: boolean
  visiblePartner: boolean
  fieldsJson: string
  providerId: string | null
  styleRefs: StyleRef[]
  styleRefsEdited: boolean
  promptBody: string
  modelParamsJson: string
  // Chinese display text (templates.translations.zh); blank means "show the English".
  zh: ZhFormValues
  // The 开关 cards (T89); fieldsJson and modelParamsJson leave their parts out.
  toggles: ToggleFormValue[]
}

export type ZhFormValues = { name: string; description: string; fields: Record<string, { label: string; placeholder: string }> }

const emptyZh = (): ZhFormValues => ({ name: '', description: '', fields: {} })

const DEFAULT_FIELDS = {
  images: { min: 1, max: 1 },
  copy: [],
  aspectRatios: ['1:1', '4:5'],
}

const pretty = (value: unknown) => JSON.stringify(value, null, 2)

export function emptyFormValues(): TemplateFormValues {
  return {
    id: '',
    module: 'image',
    name: '',
    description: '',
    category: '',
    quality: 'high',
    credits: { '1k': '2', '2k': '4', '3k': '6' },
    visibleWeb: true,
    visiblePartner: false,
    fieldsJson: pretty(DEFAULT_FIELDS),
    providerId: null,
    styleRefs: [],
    styleRefsEdited: false,
    promptBody: '',
    modelParamsJson: '{}',
    zh: emptyZh(),
    toggles: [],
  }
}

function toZhValues(template: AdminTemplate): ZhFormValues {
  const zh = template.translations.zh
  const fields = Object.fromEntries(
    Object.entries(zh?.fields ?? {}).map(([key, text]) => [key, { label: text.label ?? '', placeholder: text.placeholder ?? '' }]),
  )
  return { name: zh?.name ?? '', description: zh?.description ?? '', fields }
}

// Copy-field keys of the current JSON, so the Chinese inputs follow the field definition as
// it is being edited; unparsable JSON shows none until it parses again.
export function copyKeys(fieldsJson: string): { key: string; label: string }[] {
  try {
    const parsed: unknown = JSON.parse(fieldsJson)
    const copy = (parsed as { copy?: unknown }).copy
    if (!Array.isArray(copy)) return []
    return copy.flatMap((field: unknown) => {
      const { key, label } = (field ?? {}) as { key?: unknown; label?: unknown }
      return typeof key === 'string' ? [{ key, label: typeof label === 'string' ? label : key }] : []
    })
  } catch {
    return []
  }
}

// Only filled-in text, only for keys the fields still have; {} when nothing is translated.
// Toggles (T89) add their own label / hint / confirm text under the same `fields`.
export function toTranslations(zh: ZhFormValues, keys: readonly string[], toggles: readonly ToggleFormValue[] = []) {
  const fields = Object.fromEntries(
    keys.flatMap((key) => {
      const text = zh.fields[key]
      const label = text?.label.trim()
      const placeholder = text?.placeholder.trim()
      return label || placeholder ? [[key, { ...(label ? { label } : {}), ...(placeholder ? { placeholder } : {}) }]] : []
    }),
  )
  Object.assign(fields, toZhToggleText(toggles))
  const entry = {
    ...(zh.name.trim() ? { name: zh.name.trim() } : {}),
    ...(zh.description.trim() ? { description: zh.description.trim() } : {}),
    ...(Object.keys(fields).length > 0 ? { fields } : {}),
  }
  return Object.keys(entry).length > 0 ? { zh: entry } : {}
}

export function toFormValues(template: AdminTemplate): TemplateFormValues {
  return {
    id: template.id,
    module: template.module,
    name: template.name,
    description: template.description ?? '',
    category: template.category,
    quality: template.quality,
    credits: {
      '1k': String(template.creditsCost['1k']),
      '2k': String(template.creditsCost['2k']),
      '3k': String(template.creditsCost['3k']),
    },
    visibleWeb: template.visibleIn.includes('web'),
    visiblePartner: template.visibleIn.includes('partner'),
    fieldsJson: pretty(withoutToggles(template.fields)),
    providerId: template.prompt?.providerId ?? null,
    styleRefs: template.prompt?.styleRefs ?? [],
    styleRefsEdited: false,
    promptBody: template.prompt?.body ?? '',
    modelParamsJson: pretty(withoutToggles(template.prompt?.modelParams ?? {})),
    zh: toZhValues(template),
    toggles: toToggleValues(template),
  }
}

type BuildResult = { ok: true; payload: SaveTemplatePayload } | { ok: false; message: string }

function parseJson(text: string, label: string): { ok: true; value: unknown } | { ok: false; message: string } {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false, message: `${label} 不是合法的 JSON` }
  }
}

export const TIER_LABEL: Record<Resolution, string> = { '1k': 'Standard', '2k': 'HD', '3k': 'Max' }

// Resolutions whose number is missing or under the floor for the chosen quality. The server
// runs the same check (ARCHITECTURE §6.1); this only saves a round trip.
export function creditProblems(values: TemplateFormValues, floor: CreditsFloor): Partial<Record<Resolution, string>> {
  const problems: Partial<Record<Resolution, string>> = {}
  for (const resolution of RESOLUTIONS) {
    const text = values.credits[resolution].trim()
    const value = Number(text)
    const min = floor[values.quality][resolution]
    if (!/^\d+$/.test(text)) problems[resolution] = '请填正整数'
    else if (value === approvedCredit(floor, values.quality, resolution)) continue
    else if (min === MISSING_COST) problems[resolution] = floorGuidance(min)
    else if (value < min) problems[resolution] = `不能低于下限 ${min}`
  }
  return problems
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

// The 开关 cards folded into fields and model params (T89), with the save's own refusal said
// before the round trip: a toggle without its {{key}} or a fragment (the server checks again).
function withToggles(values: TemplateFormValues, fields: unknown, params: unknown) {
  if (!isObject(fields)) return { ok: false as const, message: '字段定义要是一个 JSON 对象' }
  if (!isObject(params)) return { ok: false as const, message: '模型参数要是一个 JSON 对象' }
  const toggles = toToggleFields(values.toggles)
  const modelParams = { ...withoutToggles(params), ...toFragments(values.toggles) }
  const problems = toggleSetupProblems(toggles, values.promptBody, modelParams)
  if (problems.length > 0) return { ok: false as const, message: problems.join('；') }
  return { ok: true as const, fields: { ...withoutToggles(fields), toggles }, modelParams }
}

// Only shapes the payload; the server validates every field again with zod and the floor.
export function buildPayload(values: TemplateFormValues, isNew: boolean, floor: CreditsFloor): BuildResult {
  const low = Object.entries(creditProblems(values, floor))
  if (low.length > 0) {
    return { ok: false, message: low.map(([r, m]) => `${TIER_LABEL[r as Resolution]}：${m}`).join('；') }
  }
  const fields = parseJson(values.fieldsJson, '字段定义')
  if (!fields.ok) return fields
  const modelParams = parseJson(values.modelParamsJson, '模型参数')
  if (!modelParams.ok) return modelParams
  const wired = withToggles(values, fields.value, modelParams.value)
  if (!wired.ok) return wired
  const visibleIn = [values.visibleWeb && 'web', values.visiblePartner && 'partner'].filter(Boolean)
  if (visibleIn.length === 0) return { ok: false, message: '至少选择一个展示入口' }
  return {
    ok: true,
    payload: {
      isNew,
      template: {
        id: values.id.trim(),
        module: values.module,
        name: values.name,
        // Always sent, so clearing the box clears the stored text (the server trims; blank is null).
        description: values.description,
        category: values.category,
        quality: values.quality,
        creditsCost: {
          '1k': Number(values.credits['1k']),
          '2k': Number(values.credits['2k']),
          '3k': Number(values.credits['3k']),
        },
        visibleIn,
        fields: wired.fields,
        translations: toTranslations(values.zh, copyKeys(values.fieldsJson).map((field) => field.key), values.toggles),
      },
      prompt: { ...(values.styleRefsEdited ? { styleRefs: values.styleRefs } : {}), providerId: values.providerId, body: values.promptBody, modelParams: wired.modelParams },
    },
  }
}

export function matchesSearch(template: AdminTemplate, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [template.id, template.name, template.category, template.categoryInfo.nameZh, template.categoryInfo.nameEn].some((text) => text.toLowerCase().includes(q))
}
