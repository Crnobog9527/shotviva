import type { ImageProviderOption } from '../../src/core/admin/image-provider-field'
import { creditsBelowFloor, MISSING_COST } from '../../src/core/templates/pricing'
import { providerFloor } from '../../src/core/templates/provider-pricing'
import type { TemplateItem } from './schema'
import type { DbState } from './state'
import { resolveModel } from './template-payload'

// Provider profiles in a batch file (1390–1394): `profiles.<key>` saves a profile that is not live
// (save_profile: the live template is untouched), `activeProfile` switches through the admin's own
// switch (switch_profile), after the profile is saved. The live profile is written with the
// template's own prompt / model fields, so naming it under `profiles` is refused.

type Key = 'openai' | 'seedream'
type Step = Record<string, unknown>

// An Ark model is the Seedream family; every other one belongs to the ChatGPT profile.
const isArk = (option: ImageProviderOption | undefined) => Boolean(option && !option.openAI && option.fixedCapabilities)

function saveProfileStep(item: TemplateItem, key: Key, state: DbState, problems: string[], notes: string[]): Step | null {
  const file = item.profiles?.[key]
  if (!file) return null
  const current = state.profiles.get(item.id)
  if (!current) { problems.push('模板不存在：供应商配置只能加在已有模板上'); return null }
  if (current.active === key) { problems.push(`${key} 配置正在用：直接写模板的 prompt / model 字段`); return null }
  let providerId: string | null
  try {
    providerId = resolveModel(file.model, null, state.providers)
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error))
    return null
  }
  const option = state.providers.find(p => p.id === providerId)
  if ((key === 'seedream') !== isArk(option)) {
    problems.push(key === 'seedream' ? 'Seedream 配置要用火山方舟的模型' : 'ChatGPT 配置不能用火山方舟的模型')
    return null
  }
  const stored = current.stored[key]
  const live = current.stored[current.active]
  const quality = file.quality ?? 'medium'
  const unpriced = file.unpricedResolutions ?? (key === 'seedream' ? ['4k'] : [])
  const styleRefs = file.styleRefs === 'live' ? live?.styleRefs ?? [] : stored?.styleRefs ?? []
  const low = creditsBelowFloor(quality, file.creditsCost, providerFloor(state.floors, providerId, item.id), unpriced)
  if (low.length) notes.push(`${key} 配置低于成本下限（${low.map(v => v.floor === MISSING_COST ? `${v.resolution} 缺少成本估价` : `${v.resolution} 至少 ${v.floor}`).join('，')}）：切换时会被拒绝`)
  const prompt = { body: file.prompt.body, model_params: file.prompt.modelParams ?? stored?.modelParams ?? {}, provider_id: providerId, style_refs: styleRefs }
  if (stored && JSON.stringify([stored.body, stored.modelParams, stored.providerId, stored.styleRefs, stored.quality, stored.creditsCost, [...stored.unpricedResolutions].sort()])
    === JSON.stringify([prompt.body, prompt.model_params, providerId, styleRefs, quality, file.creditsCost, [...unpriced].sort()])) return null
  return { op: 'save_profile', id: item.id, profile: key, prompt, quality, credits_cost: file.creditsCost, unpriced_resolutions: unpriced }
}

export function planProfiles(item: TemplateItem, state: DbState, problems: string[], notes: string[]): Step[] {
  if (!item.profiles && !item.activeProfile) return []
  const steps: Step[] = []
  for (const key of ['openai', 'seedream'] as const) {
    const step = saveProfileStep(item, key, state, problems, notes)
    if (step) steps.push(step)
  }
  const current = state.profiles.get(item.id)
  if (item.activeProfile && current && item.activeProfile !== current.active) {
    if (!current.stored[item.activeProfile] && !item.profiles?.[item.activeProfile]) problems.push(`还没有 ${item.activeProfile} 配置，不能切换`)
    steps.push({ op: 'switch_profile', id: item.id, profile: item.activeProfile })
  }
  return steps
}
