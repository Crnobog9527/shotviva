import { describe, expect, it } from 'vitest'

import { categoryInputSchema, localizeCategory, suggestCategoryKey, toCategory, type Category } from './categories'

// T75: categories are rows in template_categories (ARCHITECTURE §5 「模板分类由后台管理」).
const art: Category = { key: 'art-styles', nameEn: 'Art Styles', nameZh: '画风', introEn: 'Drawings.', introZh: null, cardStyle: 'compare', sortOrder: 10 }

describe('template categories', () => {
  it('maps a row and shows it in each language, a missing intro as none', () => {
    const row = { key: 'art-styles', name_en: 'Art Styles', name_zh: '画风', intro_en: 'Drawings.', intro_zh: null, card_style: 'compare' as const, sort_order: 10 }
    expect(toCategory(row)).toEqual(art)
    expect(localizeCategory(art, 'en')).toEqual({ key: 'art-styles', name: 'Art Styles', intro: 'Drawings.', compare: true, sortOrder: 10 })
    expect(localizeCategory(art, 'zh')).toEqual({ key: 'art-styles', name: '画风', intro: '', compare: true, sortOrder: 10 })
    expect(localizeCategory({ ...art, cardStyle: 'pair' }, 'en').compare).toBe(false)
  })

  it('proposes the English name as a slug for a new key, as analytics already sent it', () => {
    expect(suggestCategoryKey('Food & Drink')).toBe('food-drink')
    expect(suggestCategoryKey('  Products & Resale ')).toBe('products-resale')
    expect(suggestCategoryKey('宠物')).toBe('')
    expect(suggestCategoryKey('x'.repeat(50))).toHaveLength(40)
  })

  it('accepts the admin form within the limits, intros optional', () => {
    const input = { key: 'kids', nameEn: 'Kids', nameZh: '儿童', introEn: '  ', introZh: '小朋友的照片。', cardStyle: 'pair' }
    expect(categoryInputSchema.parse(input)).toEqual({ ...input, introEn: null })
    for (const bad of [
      { key: 'Kids' },
      { key: 'kids_' },
      { key: '-kids' },
      { nameEn: '' },
      { nameEn: 'x'.repeat(33) },
      { nameZh: '一二三四五六七八九十一二三' },
      { introZh: 'x'.repeat(201) },
      { cardStyle: 'grid' },
    ]) {
      expect(categoryInputSchema.safeParse({ ...input, ...bad }).success, JSON.stringify(bad)).toBe(false)
    }
  })
})
