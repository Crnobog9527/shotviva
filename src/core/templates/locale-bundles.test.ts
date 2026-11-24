import { describe, expect, it } from 'vitest'

import { localeBundles, type LocaleDisplay } from './locale-display'

const bundle = (id: string, featuredRank: number | null) => ({ id, nameEn: id, nameZh: id, templateIds: ['t'], featuredRank })
const list = [bundle('late', 2), bundle('first', 1), bundle('unplaced', null)]
const display = (featured: LocaleDisplay['featured'], locale: Record<string, string[]> = {}): LocaleDisplay =>
  ({ categoryOrder: {}, featured, bundles: { list, locale } })

describe('localeBundles', () => {
  it('follows the default bundles until the language has its own, whatever its featured templates do', () => {
    expect(localeBundles(display({}), 'zh').map((b) => b.id)).toEqual(['first', 'late'])
    expect(localeBundles(display({ en: ['t'] }), 'en').map((b) => b.id)).toEqual(['first', 'late'])
  })

  it('shows a language\'s own bundles in its order', () => {
    expect(localeBundles(display({}, { zh: ['unplaced', 'gone', 'late'] }), 'zh').map((b) => b.id)).toEqual(['unplaced', 'late'])
  })

  it('has none on a database without bundles', () => {
    expect(localeBundles({ categoryOrder: {}, featured: {} }, 'en')).toEqual([])
  })
})
