import { describe, expect, it } from 'vitest'

import { isKnownCategory, TEMPLATE_CATEGORIES } from '@/core/templates/categories'
import en from '@/site/messages/en.json'
import zh from '@/site/messages/zh.json'

import { categoryCopy } from '@/core/admin/templates-editor/copy'

describe('admin category picker', () => {
  it('offers the six stored names of ARCHITECTURE §5, with the zh labels the pages use', () => {
    expect([...TEMPLATE_CATEGORIES]).toEqual(['Food & Drink', 'Products & Resale', 'Beauty & Skincare', 'Rooms & Spaces', 'Pets', 'Art Styles'])
    expect(categoryCopy.zh).toEqual(zh.app.categories)
    expect(Object.keys(en.app.categories).sort()).toEqual([...TEMPLATE_CATEGORIES].sort())
  })

  it('matches stored names exactly, so a lower-case or partial name counts as new', () => {
    expect(isKnownCategory('Products & Resale')).toBe(true)
    for (const typed of ['products', 'Products', 'Art styles', '', ' Pets']) expect(isKnownCategory(typed)).toBe(false)
  })
})
