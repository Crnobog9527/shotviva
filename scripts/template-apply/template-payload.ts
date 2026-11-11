import { validateTemplateSave } from '../../src/core/admin/templates/commands'
import { toUpsertArgs } from '../../src/core/admin/templates/rpc-payload'
import type { AdminTemplate } from '../../src/core/admin/templates/types'
import type { ImageProviderOption } from '../../src/core/admin/image-provider-field'
import { RESOLUTIONS } from '../../src/core/templates/output-options'
import { providerFloor, type ProviderFloors } from '../../src/core/templates/provider-pricing'
import type { StyleRef } from '../../src/core/templates/style-refs'
import type { TemplateItem } from './schema'

// The editor's save payload for one file item: the stored template with the file's fields laid
// over it, validated by validateTemplateSave (the same zod schema, floor and toggle checks the
// admin page runs) and shaped by toUpsertArgs (the same RPC payload).

// The template fields a file item may set; omitted ones keep the stored value.
const FIELD_KEYS = ['module', 'name', 'description', 'category', 'fields', 'quality', 'creditsCost',
  'unpricedResolutions', 'sortOrder', 'visibleIn', 'translations'] as const

export function givesTemplateFields(item: TemplateItem) {
  return FIELD_KEYS.some(key => item[key] !== undefined) || item.prompt !== undefined
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// 'default' follows the site default; otherwise exactly one image provider by id, label or model.
export function resolveModel(model: string | undefined, current: string | null | undefined, providers: ImageProviderOption[]): string | null {
  if (model === undefined) return current ?? null
  if (model === 'default') return null
  const named = providers.filter(p => p.id !== 'env' && (UUID.test(model) ? p.id === model : p.label === model || p.model === model))
  if (named.length === 1) return named[0].id
  throw new Error(named.length === 0 ? `找不到出图模型「${model}」` : `出图模型「${model}」对应多个供应商，请改用供应商 ID`)
}

function storedInput(t: AdminTemplate) {
  return {
    id: t.id, module: t.module, name: t.name, description: t.description,
    category: t.subcategoryKey ?? t.category, fields: t.fields, quality: t.quality, creditsCost: t.creditsCost,
    unpricedResolutions: [...(t.unpricedResolutions ?? [])], visibleIn: t.visibleIn, translations: t.translations,
  }
}

function fileFields(item: TemplateItem) {
  return Object.fromEntries(FIELD_KEYS.filter(key => item[key] !== undefined).map(key => [key, item[key]]))
}

// A new template sells only the tiers its model offers unless the file says otherwise (the
// editor's storedPrices rule for a new template).
function newUnpriced(item: TemplateItem, floors: ProviderFloors, providerId: string | null) {
  if (item.unpricedResolutions !== undefined) return item.unpricedResolutions
  const supported = providerFloor(floors, providerId, item.id).resolutions
  return supported ? RESOLUTIONS.filter(tier => !supported.includes(tier)) : []
}

export type SavePlan = { args: ReturnType<typeof toUpsertArgs>; providerId: string | null; template: ReturnType<typeof validateTemplateSave>['template'] }

export function buildSave(item: TemplateItem, current: AdminTemplate | undefined, ctx: {
  floors: ProviderFloors; providers: ImageProviderOption[]; styleRefs?: StyleRef[]
}): SavePlan {
  const providerId = resolveModel(item.model, current?.prompt?.providerId, ctx.providers)
  const body = item.prompt?.body ?? current?.prompt?.body
  if (!body) throw new Error(current ? '模板没有提示词，文件里要写 prompt.body' : '新模板要写 prompt.body')
  const base = current ? storedInput(current) : { id: item.id, visibleIn: ['web'], unpricedResolutions: newUnpriced(item, ctx.floors, providerId) }
  const template = { ...base, ...fileFields(item), id: item.id }
  const prompt = {
    providerId, body, modelParams: item.prompt?.modelParams ?? current?.prompt?.modelParams ?? {},
    ...(ctx.styleRefs ? { styleRefs: ctx.styleRefs } : {}),
  }
  const valid = validateTemplateSave({ isNew: !current, template, prompt }, ctx.floors)
  return { args: toUpsertArgs(valid.template, valid.prompt, { floors: ctx.floors }), providerId, template: valid.template }
}

const sorted = (value: unknown): unknown => Array.isArray(value) ? value.map(sorted)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sorted(v)]))
    : value
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a ?? null)) === JSON.stringify(sorted(b ?? null))

// Whether a save would leave the row as it is, so a re-run reports 无变化 instead of 更新. A
// difference this misses only costs a save that changes nothing (the version stays the same).
export function savesNothing(plan: SavePlan, current: AdminTemplate) {
  const t = plan.args.p_template as typeof plan.args.p_template & { category_key?: string }
  const p = plan.args.p_prompt
  const refs = (plan.args as { p_style_refs?: StyleRef[] }).p_style_refs
  return same([t.name, t.description ?? null, t.module, t.fields, t.quality, t.credits_cost, t.visible_in, t.translations ?? current.translations,
    t.unpriced_resolutions ?? [], t.category_key, p.body, p.model_params, p.provider_id ?? null, refs ?? current.prompt?.styleRefs],
  [current.name, current.description, current.module, current.fields, current.quality, current.creditsCost, current.visibleIn, current.translations,
    current.unpricedResolutions ?? [], current.subcategoryKey ?? current.category, current.prompt?.body, current.prompt?.modelParams,
    current.prompt?.providerId ?? null, current.prompt?.styleRefs])
}
