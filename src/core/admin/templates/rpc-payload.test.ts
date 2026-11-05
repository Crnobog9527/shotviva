import { describe, expect, it } from 'vitest'

import { templateInputSchema } from '@/core/templates'

import { toUpsertArgs } from './rpc-payload'

const template = templateInputSchema.parse({
  id: 'salad-bowl',
  name: 'Salad bowl',
  category: 'salads',
  visibleIn: ['web'],
  quality: 'medium',
  creditsCost: { '1k': 1, '2k': 2, '3k': 3 },
  fields: { images: { min: 1, max: 1 }, aspectRatios: ['1:1'] },
})

describe('toUpsertArgs', () => {
  it('omits sort order and status when not given, so edits keep stored values', () => {
    const args = toUpsertArgs(template, { body: 'x', modelParams: {} })
    expect(args.p_template).not.toHaveProperty('sort_order')
    expect(args.p_template).not.toHaveProperty('is_active')
  })

  it('sends quality and the three prices, and leaves covers out unless given', () => {
    const args = toUpsertArgs(template, { body: 'x', modelParams: {} })
    expect(args.p_template).toMatchObject({ quality: 'medium', credits_cost: { '1k': 1, '2k': 2, '3k': 3 } })
    expect(args.p_template).not.toHaveProperty('cover_before_url')
    const withCover = toUpsertArgs({ ...template, coverAfterUrl: 'https://a.test/x.webp' }, { body: 'x', modelParams: {} })
    expect(withCover.p_template).toMatchObject({ cover_after_url: 'https://a.test/x.webp' })
  })

  it('passes them through when given', () => {
    const args = toUpsertArgs({ ...template, sortOrder: 30, isActive: true }, { body: 'x', modelParams: {} })
    expect(args.p_template).toMatchObject({ sort_order: 30, is_active: true })
  })
})
