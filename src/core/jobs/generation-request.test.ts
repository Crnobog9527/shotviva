import { describe, expect, it } from 'vitest'

import { generateBodySchema, toGenerationRequest } from './generation-request'

const body = (inputs: Record<string, unknown>) => ({ template_id: 'pet-studio', inputs })

describe('POST /api/generate body (T16)', () => {
  it('defaults: no resolution, aspect or note means Standard / Original / none downstream', () => {
    const parsed = generateBodySchema.parse({ template_id: 'pet-studio' })
    const request = toGenerationRequest('user-1', parsed)
    expect(request).toMatchObject({ resolution: undefined, aspectRatio: undefined, note: undefined })
  })

  it('takes the three tiers and the eight sizes', () => {
    const parsed = generateBodySchema.parse(body({ resolution: '3k', aspect_ratio: 'original' }))
    expect(toGenerationRequest('user-1', parsed)).toMatchObject({ resolution: '3k', aspectRatio: 'original' })
    for (const aspect of ['16:9', '4:5', '1:1', '9:16', '3:2', '4:3', '2:3']) {
      expect(generateBodySchema.safeParse(body({ aspect_ratio: aspect })).success).toBe(true)
    }
  })

  it('rejects an unknown resolution or size (the route answers 422)', () => {
    expect(generateBodySchema.safeParse(body({ resolution: '8k' })).success).toBe(false)
    expect(generateBodySchema.safeParse(body({ resolution: '4k' })).success).toBe(false)
    expect(generateBodySchema.safeParse(body({ aspect_ratio: '21:9' })).success).toBe(false)
  })

  it('trims the note, drops a blank one and refuses more than 300 characters', () => {
    expect(generateBodySchema.parse(body({ note: '  add mint  ' })).inputs.note).toBe('add mint')
    expect(generateBodySchema.parse(body({ note: '   ' })).inputs.note).toBeUndefined()
    expect(generateBodySchema.safeParse(body({ note: 'x'.repeat(301) })).success).toBe(false)
  })

  it('takes a batch size from 1 to the largest batchMax (30), absent for a single photo', () => {
    expect(toGenerationRequest('user-1', generateBodySchema.parse({ template_id: 'pet-studio', batch_size: 30 })).batchSize).toBe(30)
    expect(toGenerationRequest('user-1', generateBodySchema.parse({ template_id: 'pet-studio' })).batchSize).toBeUndefined()
    expect(generateBodySchema.safeParse({ template_id: 'pet-studio', batch_size: 31 }).success).toBe(false)
    expect(generateBodySchema.safeParse({ template_id: 'pet-studio', batch_size: 0 }).success).toBe(false)
  })
})
