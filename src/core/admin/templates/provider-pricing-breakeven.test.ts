import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { creditsBelowFloor, worstMargin } from '@/core/templates/pricing'
import { imageCostBudget, minimumCredits } from '@/core/templates/provider-pricing'
import { marginNote } from '../templates-editor/tier-price'
import { bulkMarginWarnings } from './bulk-edit-rules'
import { listImageProviderOptions, pricingFromOptions } from './provider-pricing'

// 1568, synthetic numbers only: the editor divides by the database's floor budget (worst-case
// break-even) and shows the worst margin against the policy target, without refusing it.
const unitPrice = 0.01
const breakeven = 0.007 // unitPrice x (1 - a 30% worst fee)
const estimate = 0.05
const row = {
  provider_id: '6b0c6b3e-2f1a-4f55-9b0e-3d1f2a7c9e11', label: 'Line', model: 'vendor/model', adapter: 'ark_images', is_active: true,
  capabilities: { resolutions: ['1k', '2k'], aspectRatios: ['1:1'], originalRatio: false, minReferences: 0, maxReferences: 4, fetchedAt: '2026-11-15T00:00:00Z' },
  resolutions: ['1k', '2k'], approved: {}, estimated_image_costs: { '1k': estimate, '2k': estimate * 2 }, p95: {},
}
const client = (terms: Record<string, unknown>) => ({
  rpc: async () => ({ error: null, data: {
    input: { version: 'v2', unit_price: unitPrice, ...terms, providers: [row] }, receipt: { terms: 't', routes: {}, active: 'x' },
  } }),
}) as unknown as SupabaseClient

const policy = { floor_budget: breakeven, breakeven_budget: breakeven, margin_target_bp: 6000 }

describe('break-even template floor in the editor', () => {
  it('divides by the floor budget and carries the margin target', async () => {
    const [option] = await listImageProviderOptions(client(policy), 1, 'env')
    const floor = Math.ceil(estimate * 1.10 / breakeven)
    expect(option.floor.medium['1k']).toBe(floor)
    expect(option.floor.medium['1k']).toBe(minimumCredits(estimate, breakeven))
    expect(option.floor.medium['1k']).toBeLessThan(minimumCredits(estimate, imageCostBudget(unitPrice)))
    expect(option.floor.marginTarget).toBe(0.6)
    expect(pricingFromOptions([option]).marginTarget).toBe(0.6)
  })

  it('keeps the old 60%-margin budget and shows no margin without a policy', async () => {
    for (const terms of [{}, { floor_budget: imageCostBudget(unitPrice), breakeven_budget: null, margin_target_bp: null }]) {
      const [option] = await listImageProviderOptions(client(terms), 1, 'env')
      expect(option.floor.medium['1k']).toBe(minimumCredits(estimate, imageCostBudget(unitPrice)))
      expect(option.floor.marginTarget).toBeUndefined()
    }
  })

  it('refuses a price under the break-even floor and only flags one under the target', async () => {
    const [option] = await listImageProviderOptions(client(policy), 1, 'env')
    const floor = option.floor.medium['1k']
    const cost = (price: number) => ({ '1k': price, '2k': 999, '4k': 1 })
    expect(creditsBelowFloor('medium', cost(floor - 1), option.floor, ['4k'])).toEqual([{ resolution: '1k', floor, given: floor - 1 }])
    expect(creditsBelowFloor('medium', cost(floor), option.floor, ['4k'])).toEqual([])
    expect(worstMargin(option.floor, 'medium', '1k', floor)).toMatchObject({ margin: 0, low: true })
    const high = Math.ceil(floor / 0.4)
    expect(worstMargin(option.floor, 'medium', '1k', high)?.low).toBe(false)
    expect(marginNote(option.floor, 'medium', '1k', String(floor * 2))).toEqual({ text: '最坏毛利 50%（目标 60%）', low: true })
    expect(marginNote(option.floor, 'medium', '1k', '')).toBeUndefined()
    expect(marginNote(option.floor, 'medium', '4k', '50')).toBeUndefined()
  })

  it('warns in bulk edit about tiers under the target without failing them', async () => {
    const options = await listImageProviderOptions(client(policy), 1, 'env')
    const floors = pricingFromOptions(options)
    const floor = floors.medium['1k']
    const template = {
      id: 'tpl', name: 'T', isActive: true, visibleIn: ['partner'], quality: 'medium', creditsCost: { '1k': 999, '2k': 999, '4k': 1 },
      unpricedResolutions: ['4k'], prompt: { providerId: row.provider_id }, fields: { images: {} }, description: 'd',
    }
    const warnings = bulkMarginWarnings([template] as never, { creditsCost: { '1k': floor } } as never, floors)
    expect(warnings).toEqual([{ id: 'tpl', name: 'T', resolution: '1k', margin: 0, target: 0.6 }])
  })
})
