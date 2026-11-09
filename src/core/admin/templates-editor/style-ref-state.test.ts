import { describe, expect, it } from 'vitest'

import type { ImageProviderOption } from '../image-provider-field'
import { UNPRICED } from '@/core/templates/provider-pricing'
import { referenceBudget } from './style-ref-state'

const providers: ImageProviderOption[] = [
  { id: 'default', label: '', model: '', isActive: true, openAI: true, capabilities: null, floor: UNPRICED },
  { id: 'custom', label: '', model: '', isActive: false, openAI: false, floor: UNPRICED,
    capabilities: { originalRatio: true, aspectRatios: [], resolutions: ['1k'], minReferences: 1, maxReferences: 2, fetchedAt: '2026-01-01T00:00:00Z' } },
]
const fields = '{"images":{"min":1,"max":2}}'

describe('template reference budget', () => {
  it('combines the public upload limit with the private count and follows the selected model', () => {
    expect(referenceBudget(providers, 'custom', fields, 0)).toMatchObject({ users: 2, refs: 0, max: 2, problem: null })
    expect(referenceBudget(providers, 'custom', fields, 1).problem).toBeTruthy()
    expect(referenceBudget(providers, null, fields, 2)).toMatchObject({ max: 4, problem: null })
    expect(referenceBudget(providers, null, fields, 3).problem).toBeTruthy()
    expect(referenceBudget(providers, 'missing', fields, 1).problem).toBeTruthy()
  })
})
