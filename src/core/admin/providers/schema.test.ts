import { describe, expect, it } from 'vitest'

import { saveProviderSchema } from './schema'

const ark = { label: 'Ark', adapter: 'ark_images', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seedream-5-5-261028' }

describe('saveProviderSchema', () => {
  it('requires an Ark row to carry a per-image estimate for 1k and 2k', () => {
    expect(saveProviderSchema.safeParse(ark).success).toBe(false)
    expect(saveProviderSchema.safeParse({ ...ark, estimatedImageCosts: { '1k': 0.05 } }).success).toBe(false)
    expect(saveProviderSchema.safeParse({ ...ark, estimatedImageCosts: { '1k': 0.05, '2k': 0.07 } }).success).toBe(true)
  })

  it('keeps estimates optional for the other image adapters', () => {
    expect(saveProviderSchema.safeParse({ ...ark, adapter: 'openai_images', baseUrl: 'https://api.openai.com/v1', model: 'gpt-image-2.6' }).success).toBe(true)
  })
})
