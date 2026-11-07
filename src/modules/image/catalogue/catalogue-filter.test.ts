import { describe, expect, it } from 'vitest'

import { ALL, filterCatalogue, SAVED } from './catalogue-filter'
import type { CatalogueTemplate } from './catalogue-template'

const template = (id: string, category: string) => ({ id, category }) as CatalogueTemplate
const a = template('a', 'pets')
const b = template('b', 'food-drink')
const c = template('c', 'pets')
const all = [a, b, c]

describe('catalogue filter (ARCHITECTURE §5.1b)', () => {
  it('shows everything, one category, or the saved templates in saved order', () => {
    expect(filterCatalogue(all, [], ALL)).toEqual({ active: ALL, shown: all })
    expect(filterCatalogue(all, [], 'pets')).toEqual({ active: 'pets', shown: [a, c] })
    expect(filterCatalogue(all, [c, a], SAVED)).toEqual({ active: SAVED, shown: [c, a] })
  })

  it('falls back to All once the last saved template is removed', () => {
    expect(filterCatalogue(all, [], SAVED)).toEqual({ active: ALL, shown: all })
  })
})
