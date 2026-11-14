import { describe, expect, it } from 'vitest'

import { floors, state, stored } from './fixtures.test-support'
import { planProfiles } from './plan-profiles'
import { templateItemSchema } from './schema'
import type { StoredProfile } from './state'

const ARK = '22222222-2222-4222-8222-222222222222'
const ark = { id: ARK, label: 'Ark', model: 'doubao-seedream', isActive: false, openAI: false, fixedCapabilities: true, capabilities: null, floor: floors }
const gptProfile: StoredProfile = { version: 3, body: 'GPT', modelParams: {}, providerId: null, styleRefs: [], quality: 'medium',
  creditsCost: { '1k': 40, '2k': 80, '4k': 120 }, unpricedResolutions: [] }
const seedreamFile = { model: 'Ark', prompt: { body: 'Seedream' }, creditsCost: { '1k': 20, '2k': 30, '4k': 30 } }

function plan(item: object, active: 'openai' | 'seedream' = 'openai', extra: Partial<StoredProfile> | null = null) {
  const base = state([stored('a')])
  const db = { ...base, providers: [...base.providers, ark], profiles: new Map([['a', { active, stored: {
    openai: gptProfile, ...(extra ? { seedream: { ...gptProfile, version: 4, body: 'Seedream', providerId: ARK, ...extra } } : {}),
  } }]]) }
  const problems: string[] = []
  const notes: string[] = []
  const ops = planProfiles(templateItemSchema.parse({ id: 'a', ...item }), db, problems, notes)
  return { ops, problems, notes }
}

describe('planProfiles (templates:apply provider profiles)', () => {
  it('saves a Seedream profile without touching the live one, then switches when asked', () => {
    const { ops, problems } = plan({ profiles: { seedream: seedreamFile }, activeProfile: 'seedream' })
    expect(problems).toEqual([])
    expect(ops).toEqual([
      { op: 'save_profile', id: 'a', profile: 'seedream', quality: 'medium', credits_cost: seedreamFile.creditsCost, unpriced_resolutions: ['4k'],
        prompt: { body: 'Seedream', model_params: {}, provider_id: ARK, style_refs: [] } },
      { op: 'switch_profile', id: 'a', profile: 'seedream' },
    ])
  })

  it('refuses the live profile, a ChatGPT model for Seedream, and switching to a profile that does not exist', () => {
    expect(plan({ profiles: { seedream: seedreamFile } }, 'seedream', {}).problems).toEqual(['seedream 配置正在用：直接写模板的 prompt / model 字段'])
    expect(plan({ profiles: { seedream: { ...seedreamFile, model: 'default' } } }).problems).toEqual(['Seedream 配置要用火山方舟的模型'])
    expect(plan({ activeProfile: 'seedream' }).problems).toEqual(['还没有 seedream 配置，不能切换'])
  })

  it('writes nothing when the stored profile already matches, and notes a price below the floor', () => {
    const same = plan({ profiles: { seedream: seedreamFile } }, 'openai', { creditsCost: seedreamFile.creditsCost, unpricedResolutions: ['4k'] })
    expect(same.ops).toEqual([])
    const low = plan({ profiles: { seedream: { ...seedreamFile, creditsCost: { '1k': 1, '2k': 1, '4k': 1 } } } })
    expect(low.notes).toEqual(['seedream 配置低于成本下限（1k 缺少成本估价，2k 缺少成本估价）：切换时会被拒绝'])
  })
})
