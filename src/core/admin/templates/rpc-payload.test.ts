import { describe, expect, it } from 'vitest'

import { templateInputSchema } from '@/core/templates'

import { toUpsertArgs } from './rpc-payload'

const template = templateInputSchema.parse({
  id: 'salad-bowl',
  name: 'Salad bowl',
  category: 'food-drink',
  visibleIn: ['web'],
  quality: 'medium',
  creditsCost: { '1k': 1, '2k': 2, '4k': 3 },
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
    expect(args.p_template).toMatchObject({ quality: 'medium', credits_cost: { '1k': 1, '2k': 2, '4k': 3 } })
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

  it('preserves omitted provider settings and allows explicit assignment or clearing', () => {
    const prompt = { body: 'x', modelParams: {} }
    expect(toUpsertArgs(template, prompt).p_prompt).not.toHaveProperty('provider_id')
    const providerId = '328576a9-f5b8-4c5d-b180-fe7b15deb02c'
    expect(toUpsertArgs(template, { ...prompt, providerId }).p_prompt.provider_id).toBe(providerId)
    expect(toUpsertArgs(template, { ...prompt, providerId: null }).p_prompt.provider_id).toBeNull()
  })

  it('leaves references untouched for old clients and imports; explicit empty clears them', () => {
    const old = { body: 'x', modelParams: {} }
    expect(toUpsertArgs(template, old)).not.toHaveProperty('p_style_refs')
    expect(toUpsertArgs(template, { ...old, styleRefs: [] })).toMatchObject({ p_style_refs: [] })
    const ref = { key: 'style-refs/salad-bowl/abcdef00-1234-4567-89ab-0123456789ab.webp', width: 300, height: 200, uploadedAt: '2026-01-01T00:00:00Z' }
    const args = toUpsertArgs(template, { ...old, styleRefs: [ref] })
    expect(args.p_style_refs).toEqual([ref])
    expect(JSON.stringify(args.p_template)).not.toContain(ref.key)
  })

  it('passes them through when given', () => {
    const args = toUpsertArgs({ ...template, sortOrder: 30, isActive: true }, { body: 'x', modelParams: {} })
    expect(args.p_template).toMatchObject({ sort_order: 30, is_active: true })
  })
})
