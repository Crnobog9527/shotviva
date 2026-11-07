import { describe, expect, it } from 'vitest'

import { templateInputSchema } from '@/core/templates'

import { toUpsertArgs } from './rpc-payload'

const template = templateInputSchema.parse({
  id: 'salad-bowl',
  name: 'Salad bowl',
  category: 'food-drink',
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

  // T75: the admin form's category is a key; the prompt import may give a name.
  it('sends the admin form\'s category as the key, the import\'s as a value to resolve', () => {
    const prompt = { body: 'x', modelParams: {} }
    expect(toUpsertArgs(template, prompt).p_template).toMatchObject({ category_key: 'food-drink' })
    expect(toUpsertArgs(template, prompt).p_template).not.toHaveProperty('category')
    const imported = toUpsertArgs({ ...template, category: 'Food & Drink' }, prompt, { categoryByName: true }).p_template
    expect(imported).toMatchObject({ category: 'Food & Drink' })
    expect(imported).not.toHaveProperty('category_key')
  })

  it('passes them through when given', () => {
    const args = toUpsertArgs({ ...template, sortOrder: 30, isActive: true }, { body: 'x', modelParams: {} })
    expect(args.p_template).toMatchObject({ sort_order: 30, is_active: true })
  })
})
