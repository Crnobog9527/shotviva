import { describe, expect, it } from 'vitest'

import type { AdminProvider } from '../providers/types'
import { decisionRoute, withDecisionRoute } from './decision-route'
import { canSave, formFor, tierOptions, toSaveInput } from './form-state'

const row = (baseUrl: string, model: string): AdminProvider => ({
  id: '00000000-0000-4000-8000-000000000001', module: 'decision', adapter: 'openai_responses', label: 'Judge',
  baseUrl, model, apiKeyLast4: '14gA', isActive: true, notes: null, updatedAt: '2026-11-15T00:00:00Z',
  prices: { inputTextPerM: null, inputImagePerM: null, outputPerM: null },
} as unknown as AdminProvider)

describe('decision route', () => {
  it('starts a new decision row on OpenRouter, still the Responses adapter', () => {
    const form = formFor(null, 'decision')
    expect(decisionRoute(form)).toBe('openrouter')
    expect(toSaveInput({ ...form, label: 'J', model: 'openai/gpt-6-luna', apiKey: 'sk-or-test-123456' }, null))
      .toMatchObject({ module: 'decision', adapter: 'openai_responses', baseUrl: 'https://openrouter.ai/api/v1' })
  })

  it('starts a new dish-reading row the same way: OpenRouter, Responses, no tiers to pick', () => {
    const form = formFor(null, 'dish_read')
    expect(form).toMatchObject({ module: 'dish_read', adapter: 'openai_responses', baseUrl: 'https://openrouter.ai/api/v1' })
    const ready = { ...form, label: 'Reader', model: 'openai/gpt-6-sol', apiKey: 'sk-or-test-123456' }
    expect(tierOptions(ready, null, undefined).selected).toEqual(['1k', '2k', '4k'])
    expect(toSaveInput({ ...ready, resolutions: ['1k', '2k', '4k'] }, null)).toMatchObject({ module: 'dish_read', adapter: 'openai_responses', model: 'openai/gpt-6-sol' })
  })

  it('opens a stored row by its address, and fills the table price for the openai/ name', () => {
    const router = formFor(row('https://openrouter.ai/api/v1/', 'openai/gpt-6-luna'))
    expect(decisionRoute(router)).toBe('openrouter')
    expect(router).toMatchObject({ priceInputTextPerM: '0.1', priceOutputPerM: '0.5' })
    expect(decisionRoute(formFor(row('https://api.openai.com/v1', 'gpt-6-luna')))).toBe('openai')
  })

  it('switching sets the address and renames the model, keeping typed prices', () => {
    const official = formFor(row('https://api.openai.com/v1', 'gpt-6-luna'))
    const moved = withDecisionRoute(official, 'openrouter')
    expect(moved).toMatchObject({ baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-6-luna', priceInputTextPerM: '0.1', priceOutputPerM: '0.5' })
    expect(withDecisionRoute(moved, 'openai')).toMatchObject({ baseUrl: 'https://api.openai.com/v1', model: 'gpt-6-luna' })
    const typed = withDecisionRoute({ ...official, priceOutputPerM: '0.6' }, 'openrouter')
    expect(typed.priceOutputPerM).toBe('0.6')
    expect(withDecisionRoute({ ...official, model: 'anthropic/x' }, 'openrouter').model).toBe('anthropic/x')
  })

  it('keeps an edited row saveable after the switch renames its model', () => {
    const stored = { ...row('https://api.openai.com/v1', 'gpt-6-luna'), resolutions: ['1k', '2k', '4k'] } as AdminProvider
    const moved = withDecisionRoute(formFor(stored), 'openrouter')
    const tiers = tierOptions(moved, null, stored)
    expect(tiers.selected).toEqual(['1k', '2k', '4k'])
    expect(canSave({ ...moved, resolutions: tiers.selected, apiKey: 'sk-or-test-123456' }, false)).toBe(true)
  })
})
