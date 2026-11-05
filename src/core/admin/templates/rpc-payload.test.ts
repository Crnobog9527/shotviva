import { describe, expect, it } from 'vitest'

import { templateInputSchema } from '@/core/templates'

import { toUpsertArgs } from './rpc-payload'

const template = templateInputSchema.parse({
  id: 'salad-bowl',
  name: 'Salad bowl',
  category: 'salads',
  visibleIn: ['web'],
  fields: { images: { min: 1, max: 1 }, aspectRatios: ['1:1'] },
})

describe('toUpsertArgs', () => {
  it('omits sort order and status when not given, so edits keep stored values', () => {
    const args = toUpsertArgs(template, { body: 'x', modelParams: {} })
    expect(args.p_template).not.toHaveProperty('sort_order')
    expect(args.p_template).not.toHaveProperty('is_active')
  })

  it('passes them through when given', () => {
    const args = toUpsertArgs({ ...template, sortOrder: 30, isActive: true }, { body: 'x', modelParams: {} })
    expect(args.p_template).toMatchObject({ sort_order: 30, is_active: true })
  })
})
