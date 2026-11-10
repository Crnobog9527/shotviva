import { expect, it } from 'vitest'

import { creditsBelowFloor } from '@/core/templates/pricing'
import { MISSING_COST, providerFloor } from '@/core/templates/provider-pricing'
import { buildPayload, emptyFormValues } from './form-state'
import { tierGuidance } from './tier-price'

const model = { '1k': 13, '2k': 13, '3k': 1 }
const base = { medium: model, high: model, resolutions: ['1k', '2k'] as const }
const tariff = { quality: 'medium' as const, costs: { '1k': 74, '2k': 150, '3k': 225 } }
const floors = { ...base, version: 'v2' as const, activeProvider: 'sun', providers: { seed: base, sun: base },
  approvals: { sun: { 'dark-dining': tariff } }, tariffs: { 'dark-dining': tariff } }

it('prepares editable supported tiers for a Seedream draft and preserves its hidden Max value', () => {
  const floor = providerFloor(floors, 'seed', 'korean-manhwa')
  const values = { ...emptyFormValues(), quality: 'medium' as const, credits: { '1k': '18', '2k': '17', '3k': '3' } }
  expect(buildPayload(values, false, floor)).toMatchObject({ payload: { template: { creditsCost: { '1k': 18, '2k': 17, '3k': 3 } } } })
  expect(tierGuidance(floor, 'medium', '2k')).toContain('成本保护下限 13')
  expect(tierGuidance(floor, 'medium', '3k')).toContain('模型不支持')
  const missing = { ...floor, medium: { ...model, '2k': MISSING_COST } }
  expect(buildPayload(values, false, missing)).toMatchObject({ ok: false, message: expect.stringContaining('缺少该档单张成本') })
  expect(buildPayload(values, false, { ...floor, medium: { ...model, '1k': 21 } })).toMatchObject({ ok: false })
})

it('enforces each mapped catalogue minimum even on cheap models, reserving the exception for the approved route', () => {
  const floor = providerFloor(floors, 'seed', 'dark-dining')
  expect(creditsBelowFloor('medium', { '1k': 73, '2k': 149, '3k': 224 }, floor).map(v => v.floor)).toEqual([74,150,225])
  const expensive = { ...base, medium: { ...model, '1k': 100 } }
  const changed = { ...floors, providers: { sun: expensive, seed: expensive } }
  expect(creditsBelowFloor('medium', tariff.costs, providerFloor(changed,'sun','dark-dining'))).toEqual([])
  expect(creditsBelowFloor('medium', tariff.costs, providerFloor(changed,'seed','dark-dining'))).toMatchObject([{ resolution: '1k', floor: 100 }])
  expect(providerFloor(floors,'seed','unmapped').tariff).toBeUndefined()
})
