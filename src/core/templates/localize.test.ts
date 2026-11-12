import { describe, expect, it } from 'vitest'

import { localizeTemplate } from './localize'
import { templateInputSchema } from './schema'
import type { Template } from './types'

const base: Template = {
  id: 'promo-poster',
  module: 'image',
  name: 'Promo Poster',
  description: null,
  category: 'food-drink',
  categoryInfo: { key: 'food-drink', nameEn: 'Food & Drink', nameZh: '餐饮', introEn: 'Dishes.', introZh: null, cardStyle: 'pair', sortOrder: 20, isSystem: false },
  coverBeforeUrl: null,
  coverAfterUrl: null,
  coverMediaType: 'image',
  coverVideoUrl: null,
  coverPosterUrl: null,
  coverLocales: {},
  fields: {
    images: { min: 1, max: 1 },
    copy: [
      { key: 'headline', label: 'Headline', type: 'short', required: true, maxLength: 40, public: false },
      { key: 'price', label: 'Price', type: 'short', required: false, maxLength: 12, public: false },
    ],
    aspectRatios: ['1:1'],
    toggles: [],
  },
  quality: 'high',
  creditsCost: { '1k': 2, '2k': 4, '4k': 6 },
  sortOrder: 10,
  isActive: true,
  visibleIn: ['web'],
  translations: {},
  featuredRank: null,
  createdAt: '2026-11-06T00:00:00Z',
  updatedAt: '2026-11-06T00:00:00Z',
}

describe('localizeTemplate (ARCHITECTURE §5, LAUNCH §7.6 #5)', () => {
  // T75: the category's name and intro in the page's language, its order and card style.
  it('attaches its category in the page\'s language', () => {
    expect(localizeTemplate(base, 'en').categoryView).toEqual({ key: 'food-drink', name: 'Food & Drink', intro: 'Dishes.', compare: false, sortOrder: 20 })
    expect(localizeTemplate({ ...base, translations: { zh: { name: '促销海报' } } }, 'zh').categoryView).toMatchObject({ name: '餐饮', intro: '' })
  })

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

describe('custom field text', () => {
  const sized = {
    ...base,
    fields: {
      ...base.fields,
      copy: [{ key: 'size', label: 'Size', type: 'select' as const, help: 'Pick one', options: ['Small', 'Large'], required: true, maxLength: 60, public: false }],
    },
    translations: { zh: { fields: { size: { label: '尺寸', help: '选一个', options: { Small: '小' } } } } },
  }

  it('shows Chinese help and option labels, English where missing, and keeps the English values', () => {
    const [field] = localizeTemplate(sized, 'zh').fields.copy
    expect(field).toMatchObject({ label: '尺寸', help: '选一个', options: ['Small', 'Large'], optionLabels: { Small: '小', Large: 'Large' } })
    expect(localizeTemplate(sized, 'en').fields.copy[0]).toMatchObject({ label: 'Size', help: 'Pick one', optionLabels: { Small: 'Small', Large: 'Large' } })
  })
})

describe('the English description (T52)', () => {
  const described = { ...base, description: 'Headline and price on one photo' }

  it('shows on English pages, never the Chinese one', () => {
    const both = { ...described, translations: { zh: { description: '一张图加标题和价格' } } }
    expect(localizeTemplate(both, 'en').description).toBe('Headline and price on one photo')
    expect(localizeTemplate(both, 'zh').description).toBe('一张图加标题和价格')
  })

  it('stands in on Chinese pages when the Chinese one is missing', () => {
    expect(localizeTemplate(described, 'zh').description).toBe('Headline and price on one photo')
    expect(localizeTemplate({ ...described, translations: { zh: { name: '促销海报' } } }, 'zh').description).toBe('Headline and price on one photo')
  })

  it('leaves nothing when neither is filled in', () => {
    expect(localizeTemplate(base, 'en').description).toBeNull()
    expect(localizeTemplate(base, 'zh').description).toBeNull()
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

  it('trims the English description, turns blank into null, and caps it at 160', () => {
    expect(templateInputSchema.parse({ ...input, description: '  One line  ' }).description).toBe('One line')
    expect(templateInputSchema.parse({ ...input, description: '   ' }).description).toBeNull()
    expect(templateInputSchema.parse(input).description).toBeUndefined()
    expect(templateInputSchema.safeParse({ ...input, description: 'x'.repeat(160) }).success).toBe(true)
    expect(templateInputSchema.safeParse({ ...input, description: 'x'.repeat(161) }).success).toBe(false)
  })
})
