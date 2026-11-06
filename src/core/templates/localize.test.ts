import { describe, expect, it } from 'vitest'

import { localizeTemplate } from './localize'
import { templateInputSchema } from './schema'
import type { Template } from './types'

const base: Template = {
  id: 'promo-poster',
  module: 'image',
  name: 'Promo Poster',
  category: 'Food & Drink',
  coverBeforeUrl: null,
  coverAfterUrl: null,
  coverMediaType: 'image',
  coverVideoUrl: null,
  coverPosterUrl: null,
  fields: {
    images: { min: 1, max: 1 },
    copy: [
      { key: 'headline', label: 'Headline', required: true, maxLength: 40 },
      { key: 'price', label: 'Price', required: false, maxLength: 12 },
    ],
    aspectRatios: ['1:1'],
  },
  quality: 'high',
  creditsCost: { '1k': 2, '2k': 4, '3k': 6 },
  sortOrder: 10,
  isActive: true,
  visibleIn: ['web'],
  translations: {},
  createdAt: '2026-11-06T00:00:00Z',
  updatedAt: '2026-11-06T00:00:00Z',
}

describe('localizeTemplate (ARCHITECTURE §5, LAUNCH §7.6 #5)', () => {
  it('uses the Chinese name, description and field text where they exist', () => {
    const zh = localizeTemplate(
      { ...base, translations: { zh: { name: '促销海报', description: '一张图加标题和价格', fields: { headline: { label: '标题', placeholder: '例如：周末特价' } } } } },
      'zh',
    )
    expect(zh.name).toBe('促销海报')
    expect(zh.description).toBe('一张图加标题和价格')
    expect(zh.fields.copy[0]).toMatchObject({ key: 'headline', label: '标题', placeholder: '例如：周末特价', required: true })
  })

  it('falls back to English item by item, never to blank', () => {
    const partial = localizeTemplate({ ...base, translations: { zh: { fields: { headline: { label: '标题' } } } } }, 'zh')
    expect(partial.name).toBe('Promo Poster')
    expect(partial.description).toBeNull()
    expect(partial.fields.copy.map((field) => field.label)).toEqual(['标题', 'Price'])
    expect(localizeTemplate(base, 'zh')).toMatchObject({ name: 'Promo Poster', description: null })
  })

  it('leaves English pages untouched', () => {
    const translated = { ...base, translations: { zh: { name: '促销海报' } } }
    expect(localizeTemplate(translated, 'en').name).toBe('Promo Poster')
  })
})

describe('translations input', () => {
  const input = { id: 'x', name: 'X', category: 'Pets', fields: base.fields, creditsCost: base.creditsCost, visibleIn: ['web'] }

  it('drops blank text and rejects languages that are not enabled', () => {
    const parsed = templateInputSchema.parse({ ...input, translations: { zh: { name: '  ', description: '一句话' } } })
    expect(parsed.translations).toEqual({ zh: { name: undefined, description: '一句话' } })
    expect(templateInputSchema.safeParse({ ...input, translations: { ja: { name: 'x' } } }).success).toBe(false)
  })

  it('leaves translations out when the caller sends none (the prompt import)', () => {
    expect(templateInputSchema.parse(input).translations).toBeUndefined()
  })
})
