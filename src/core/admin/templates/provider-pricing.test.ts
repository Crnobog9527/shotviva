import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { imageCostBudget, modelCreditFloor } from '@/core/templates/provider-pricing'
import { listImageProviderOptions } from './provider-pricing'

// 1552: a list-priced OpenRouter line (BYOK on openai/gpt-image-*) gets the official line's floor
// in the editor, not its catalogue estimate with the top-up factor.
const unitPrice = 0.01
const caps = { resolutions: ['1k', '2k', '4k'], aspectRatios: ['1:1'], originalRatio: true, minReferences: 0, maxReferences: 16,
  fetchedAt: '2026-11-15T00:00:00Z', catalogImageCosts: { '1k': 0.5, '2k': 0.9, '4k': 1.3 } }
const row = (listed?: boolean) => ({
  provider_id: '7941b03f-68c2-4be9-bdfb-9fa2bbd46380', label: 'Routed', model: 'openai/gpt-image-2.6-sunburst',
  adapter: 'openrouter_images', is_active: true, capabilities: caps, resolutions: ['1k', '2k', '4k'], approved: {},
  estimated_image_costs: {}, p95: {}, ...(listed === undefined ? {} : { list_priced: listed }),
})
const client = (listed?: boolean) => ({
  rpc: async () => ({ error: null, data: {
    input: { version: 'v2', unit_price: unitPrice, providers: [row(listed)] },
    receipt: { terms: 't', routes: {}, active: 'x' },
  } }),
}) as unknown as SupabaseClient

const officialFloor = modelCreditFloor({ openAI: true, resolutions: ['1k', '2k', '4k'], estimates: {}, p95: {} }, imageCostBudget(unitPrice))
const catalogFloor = modelCreditFloor({ openAI: false, resolutions: ['1k', '2k', '4k'], estimates: caps.catalogImageCosts, p95: {} },
  imageCostBudget(unitPrice))

describe('editor floor of an OpenRouter GPT image line', () => {
  it('is the official line floor, for each quality, when the line is list-priced', async () => {
    const [option] = await listImageProviderOptions(client(true), 1, 'env-model')
    expect(option.floor.medium).toEqual(officialFloor.medium)
    expect(option.floor.high).toEqual(officialFloor.high)
    expect(option.floor.high['1k']).toBeGreaterThan(option.floor.medium['1k'])
  })

  it('stays on the catalogue estimate when BYOK is off or the database predates 1552', async () => {
    for (const listed of [false, undefined]) {
      const [option] = await listImageProviderOptions(client(listed), 1, 'env-model')
      expect(option.floor.medium).toEqual(catalogFloor.medium)
    }
  })
})
