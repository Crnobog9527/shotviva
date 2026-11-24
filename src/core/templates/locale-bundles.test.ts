import { describe, expect, it } from 'vitest'

import { localeBundles } from './locale-display'

const bundle = (id: string, featuredRank: number | null) => ({ id, nameEn: id, nameZh: id, templateIds: ['t'], featuredRank })
const list = [bundle('late', 2), bundle('first', 1), bundle('unplaced', null)]
const bundles = (locale: Record<string, string[]> = {}) => ({ list, locale })

describe('localeBundles', () => {
  it('follows the default bundles until the language has its own', () => {
    expect(localeBundles(bundles(), 'zh').map((b) => b.id)).toEqual(['first', 'late'])
    expect(localeBundles(bundles({ zh: [] }), 'en').map((b) => b.id)).toEqual(['first', 'late'])
  })

  it('shows a language\'s own bundles in its order', () => {
    expect(localeBundles(bundles({ zh: ['unplaced', 'gone', 'late'] }), 'zh').map((b) => b.id)).toEqual(['unplaced', 'late'])
  })

  it('has none on a database without bundles', () => {
    expect(localeBundles(undefined, 'en')).toEqual([])
  })
})
