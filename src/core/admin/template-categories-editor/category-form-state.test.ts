import { describe, expect, it } from 'vitest'

import type { AdminCategoryNode } from '../template-categories/types'
import { buildCategoryPayload, emptyCategoryValues, patchCategoryValues, toCategoryValues } from './category-form-state'

const pets: AdminCategoryNode = { key: 'pets', nameEn: 'Pets', nameZh: '宠物', introEn: 'Portraits.', introZh: null, cardStyle: 'pair', sortOrder: 60, isSystem: false, templateCount: 2,
  parentId: null, level: 1, slug: 'pets', isVisible: true, seoTitleZh: null, seoTitleEn: null,
  seoDescriptionEn: null, seoDescriptionZh: null, seriesCount: 0 }

describe('category form (T75)', () => {
  it('derives a new key from the English name until the admin types one', () => {
    let values = patchCategoryValues(emptyCategoryValues(), { nameEn: 'Kids & Family' }, true)
    expect(values.key).toBe('kids-family')
    values = patchCategoryValues(values, { key: 'kids' }, true)
    values = patchCategoryValues(values, { nameEn: 'Kids' }, true)
    expect(values.key).toBe('kids')
  })

  it('never touches an existing category\'s key', () => {
    const values = patchCategoryValues(toCategoryValues(pets), { nameEn: 'Pet Portraits' }, false)
    expect(values.key).toBe('pets')
    expect(values.introZh).toBe('')
  })

  it('builds the save payload, or nothing when a name or the key is missing or malformed', () => {
    const values = { ...toCategoryValues(pets), nameZh: ' 萌宠 ' }
    expect(buildCategoryPayload(values, false)).toEqual({
      isNew: false,
      category: { key: 'pets', slug: 'pets', isVisible: true, parentId: null, seoTitleZh: '', seoTitleEn: '',
        seoDescriptionZh: '', seoDescriptionEn: '', nameZh: '萌宠', nameEn: 'Pets', introZh: '', introEn: 'Portraits.', cardStyle: 'pair' },
    })
    expect(buildCategoryPayload({ ...values, nameEn: ' ' }, false)).toBeNull()
    expect(buildCategoryPayload({ ...values, key: 'Pets!' }, true)).toBeNull()
    expect(buildCategoryPayload({ ...values, nameZh: '一二三四五六七八九十一二三' }, false)).toBeNull()
  })

  it('keeps a custom child slug when the name changes', () => {
    const values = patchCategoryValues(emptyCategoryValues('pets'), { nameEn: 'New Pets' }, true)
    expect(values.slug).toBe('new-pets')
    const custom = patchCategoryValues(values, { slug: 'portraits' }, true)
    expect(patchCategoryValues(custom, { nameEn: 'Portrait Photography' }, true)).toMatchObject({
      parentId: 'pets', key: 'portrait-photography', slug: 'portraits',
    })
  })
})
