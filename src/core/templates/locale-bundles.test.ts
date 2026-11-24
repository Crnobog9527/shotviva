import { describe, expect, it } from 'vitest'

import { localeBundles, type LocaleDisplay } from './locale-display'

const bundle = (id: string, featuredRank: number | null) => ({ id, nameEn: id, nameZh: id, templateIds: ['t'], featuredRank })
const list = [bundle('late', 2), bundle('first', 1), bundle('unplaced', null)]
const display = (featured: LocaleDisplay['featured'], locale: Record<string, string[]> = {}): LocaleDisplay =>
  ({ categoryOrder: {}, featured, bundles: { list, locale } })

describe('localeBundles', () => {
  it('follows the default bundles while the language follows the default featured list', () => {
    expect(localeBundles(display({}, { zh: ['unplaced'] }), 'zh').map((b) => b.id)).toEqual(['first', 'late'])
  })

  it('shows a language\'s own bundles, possibly none, beside its own featured list', () => {
    expect(localeBundles(display({ zh: ['t'] }, { zh: ['unplaced', 'gone', 'late'] }), 'zh').map((b) => b.id)).toEqual(['unplaced', 'late'])
    expect(localeBundles(display({ en: ['t'] }), 'en')).toEqual([])
  })

  it('has none on a database without bundles', () => {
    expect(localeBundles({ categoryOrder: {}, featured: {} }, 'en')).toEqual([])
  })
})
