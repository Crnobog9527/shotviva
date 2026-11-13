import type { StyleRef } from '@/core/templates/style-refs'
import { MISSING_COST, floorGuidance } from '@/core/templates/provider-pricing'
import { unsupportedTier } from './tier-price'
import { editablePrices, storedPrices } from './sale-tier-fields'
import { RESOLUTIONS, type Resolution } from '@/core/templates/output-options'
import { approvedCredit, creditMinimum, type CreditsCost, type CreditsFloor, type TemplateQuality } from '@/core/templates/pricing'
import { toggleFragments, toggleSetupProblems } from '@/core/templates/toggles'

import type { AdminTemplate, SaveTemplatePayload } from '../templates/types'
import { toFragments, toToggleFields, toToggleValues, toZhToggleText, withoutToggles, type ToggleFormValue } from './toggle-form-state'
import { copySetupProblems, toCopyFields, toCopyValues, toZhCopyText, withoutCopy, type CopyFormValue } from './copy-form-state'
import { slotSetupProblems, toImages, toSlotValues, toZhSlotText, withoutSlots, type SlotFormValue } from './slot-form-state'

export type TemplateFormValues = {
  expectedVersion?: number
  restoredParams?: Record<string, unknown>
  forkVersion?: boolean
  selectedVersion?: number
  id: string
  module: 'image' | 'video'
  name: string
  // English one-liner (T52); blank saves as none.
  description: string
  category: string
  seriesId: string | null
  originalCategory?: string
  originalSeriesId?: string | null
  quality: TemplateQuality
  // One text box per resolution; parsed on save.
  storedCredits?: CreditsCost
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
  // The 用户填写的字段 cards (fields.copy and their Chinese text); fieldsJson leaves them out.
  copyFields: CopyFormValue[]
  // The 图片格子 cards (fields.images.slots, §5.1e); fieldsJson leaves the slots out.
  imageSlots: SlotFormValue[]
}

// The template's own Chinese name and one-liner; field text lives on the field cards.
export type ZhFormValues = { name: string; description: string }

const emptyZh = (): ZhFormValues => ({ name: '', description: '' })

const DEFAULT_FIELDS = {
  images: { min: 1, max: 1 },
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
    seriesId: null,
    quality: 'high',
    credits: { '1k': '2', '2k': '4', '4k': '6' },
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
    copyFields: [],
    imageSlots: [],
  }
}

function toZhValues(template: AdminTemplate): ZhFormValues {
  const zh = template.translations.zh
  return { name: zh?.name ?? '', description: zh?.description ?? '' }
}

// Only filled-in text; {} when nothing is translated. The field cards (copy and toggles) add
// their own text under `fields`.
export function toTranslations(zh: ZhFormValues, copyFields: readonly CopyFormValue[] = [], toggles: readonly ToggleFormValue[] = [], slots: readonly SlotFormValue[] = []) {
  const fields = { ...toZhCopyText(copyFields), ...toZhToggleText(toggles), ...toZhSlotText(slots) }
  const entry = {
    ...(zh.name.trim() ? { name: zh.name.trim() } : {}),
    ...(zh.description.trim() ? { description: zh.description.trim() } : {}),
    ...(Object.keys(fields).length > 0 ? { fields } : {}),
  }
  return Object.keys(entry).length > 0 ? { zh: entry } : {}
}

const savedVersion = (template: AdminTemplate) => template.prompt?.version

function savedAssignment(template: AdminTemplate) {
  const category = template.subcategoryKey ?? template.category
  const seriesId = template.seriesId ?? null
  return { category, seriesId, originalCategory: category, originalSeriesId: seriesId }
}

export function toFormValues(template: AdminTemplate): TemplateFormValues {
  return {
    expectedVersion: savedVersion(template),
    id: template.id,
    module: template.module,
    name: template.name,
    description: template.description ?? '',
    ...savedAssignment(template),
    quality: template.quality,
    storedCredits: template.creditsCost,
    credits: editablePrices(template.creditsCost, template.unpricedResolutions),

    visibleWeb: template.visibleIn.includes('web'),
    visiblePartner: template.visibleIn.includes('partner'),
    fieldsJson: pretty(withoutSlots(withoutCopy(withoutToggles(template.fields)))),
    providerId: template.prompt?.providerId ?? null,
    styleRefs: template.prompt?.styleRefs ?? [],
    styleRefsEdited: false,
    promptBody: template.prompt?.body ?? '',
    modelParamsJson: pretty(withoutToggles(template.prompt?.modelParams ?? {})),
    zh: toZhValues(template),
    toggles: toToggleValues(template),
    copyFields: toCopyValues(template),
    imageSlots: toSlotValues(template),
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

export const TIER_LABEL: Record<Resolution, string> = { '1k': '1K', '2k': '2K', '4k': '4K' }

// Resolutions whose number is missing or under the floor for the chosen quality. The server
// runs the same check (ARCHITECTURE §6.1); this only saves a round trip.
export function creditProblems(values: TemplateFormValues, floor: CreditsFloor): Partial<Record<Resolution, string>> {
  const problems: Partial<Record<Resolution, string>> = {}
  for (const resolution of RESOLUTIONS) {
    const text = values.credits[resolution].trim()
    if (!text || unsupportedTier(floor, resolution)) continue
    const value = Number(text)
    // A slot template is held to the single-image floor × its slots (§5.1e, migration 1310).
    const min = creditMinimum(floor, values.quality, resolution, values.imageSlots.length)
    if (!/^\d+$/.test(text)) problems[resolution] = '请填正整数'
    else if (value === approvedCredit(floor, values.quality, resolution)) continue
    else if (min === MISSING_COST) problems[resolution] = floorGuidance(min, floor.unknownCapabilities)
    else if (value < 1 || value > 999) problems[resolution] = '请填 1–999 的整数'
    else if (value < min) problems[resolution] = `不能低于下限 ${min}`
  }
  return problems
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

// The field and 开关 cards folded into fields and model params (T89), with the save's own refusals
// said before the round trip: a field card left incomplete, a toggle without its {{key}} or a
// fragment (the server checks again).
function privateFragments(values: TemplateFormValues) {
  const saved = values.restoredParams
  if (saved && Object.hasOwn(saved, 'toggles')) {
    const fragments = toggleFragments(saved)
    // An older version can have fragments for switches that no longer appear in the
    // public form. A verbatim restore must keep those bytes in its original snapshot.
    if (values.toggles.every(t => t.on === fragments[t.key]?.on && t.off === fragments[t.key]?.off)) {
      return { toggles: saved.toggles }
    }
  }
  return toFragments(values.toggles)
}

function withToggles(values: TemplateFormValues, fields: unknown, params: unknown) {
  if (!isObject(fields)) return { ok: false as const, message: '字段定义要是一个 JSON 对象' }
  if (!isObject(params)) return { ok: false as const, message: '模型参数要是一个 JSON 对象' }
  const toggles = toToggleFields(values.toggles)
  const modelParams = { ...withoutToggles(params), ...privateFragments(values) }
  const copyKeys = values.copyFields.map((field) => field.key.trim())
  const problems = [
    ...copySetupProblems(values.copyFields), ...toggleSetupProblems(toggles, values.promptBody, modelParams),
    ...slotSetupProblems(values.imageSlots, copyKeys, values.visiblePartner),
  ]
  if (problems.length > 0) return { ok: false as const, message: problems.join('；') }
  const rest = withoutCopy(withoutToggles(fields))
  return { ok: true as const, fields: { ...rest, images: toImages(values.imageSlots, rest.images), copy: toCopyFields(values.copyFields), toggles }, modelParams }
}

function revision(values: TemplateFormValues) {
  return values.expectedVersion ? { revision: {
    expected: values.expectedVersion, selected: values.forkVersion ? undefined : values.selectedVersion,
  } } : {}
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
      ...revision(values),
      assignment: { seriesId: values.seriesId, previousCategory: values.originalCategory, previousSeriesId: values.originalSeriesId },
      template: {
        id: values.id.trim(),
        module: values.module,
        name: values.name,
        // Always sent, so clearing the box clears the stored text (the server trims; blank is null).
        description: values.description,
        category: values.category,
        quality: values.quality,
        ...storedPrices(values.credits, values.storedCredits, floor.resolutions, isNew),
        visibleIn,
        fields: wired.fields,
        translations: toTranslations(values.zh, values.copyFields, values.toggles, values.imageSlots),
      },
      prompt: { ...(values.styleRefsEdited ? { styleRefs: values.styleRefs } : {}), providerId: values.providerId, body: values.promptBody, modelParams: wired.modelParams },
    },
  }
}

export function matchesSearch(template: AdminTemplate, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [template.id, template.name, template.translations.zh?.name ?? '', template.category, template.categoryInfo.nameZh, template.categoryInfo.nameEn].some((text) => text.toLowerCase().includes(q))
}
