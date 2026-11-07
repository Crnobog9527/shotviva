import { describe, expect, it } from 'vitest'

import type { AdminCategory } from '../template-categories/types'
import { buildCategoryPayload, emptyCategoryValues, moveKey, patchCategoryValues, toCategoryValues } from './category-form-state'

const pets: AdminCategory = { key: 'pets', nameEn: 'Pets', nameZh: '宠物', introEn: 'Portraits.', introZh: null, cardStyle: 'pair', sortOrder: 60, isSystem: false, templateCount: 2 }

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
      category: { key: 'pets', nameZh: '萌宠', nameEn: 'Pets', introZh: '', introEn: 'Portraits.', cardStyle: 'pair' },
    })
    expect(buildCategoryPayload({ ...values, nameEn: ' ' }, false)).toBeNull()
    expect(buildCategoryPayload({ ...values, key: 'Pets!' }, true)).toBeNull()
    expect(buildCategoryPayload({ ...values, nameZh: '一二三四五六七八九十一二三' }, false)).toBeNull()
  })

  it('swaps a category with its neighbour, never past either end', () => {
    expect(moveKey(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moveKey(['a', 'b', 'c'], 2, 1)).toBeNull()
    expect(moveKey(['a', 'b', 'c'], 0, -1)).toBeNull()
  })
})
