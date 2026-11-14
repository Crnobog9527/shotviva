import { describe, expect, it } from 'vitest'

import type { CatalogueCopyField, CatalogueImageSlot } from '../catalogue/catalogue-template'
import { groupState, initialOpen } from './field-group-state'

const field = (key: string, extra: Partial<CatalogueCopyField> = {}): CatalogueCopyField => ({ key, label: key, type: 'short', required: false, maxLength: 20, public: false, ...extra })
const fields = [field('venue', { required: true }), field('venue_en'), field('price', { type: 'number' })]
const slots: CatalogueImageSlot[] = [{ key: 'logo', label: 'Logo', required: false }, { key: 'photo', label: 'Photo', required: true }]
const group = { items: ['venue', 'venue_en', { key: 'b', label: 'B', items: ['logo', 'photo', 'price'] }] }

describe('groupState', () => {
  it('counts filled parts, required ones still empty, and values the server would refuse', () => {
    expect(groupState(group, { fields, slots, copy: {}, photos: new Set() })).toEqual({ total: 5, filled: 0, requiredMissing: 2, invalid: 0 })
    expect(groupState(group, { fields, slots, copy: { venue: 'Night', price: 'abc' }, photos: new Set(['photo']) }))
      .toEqual({ total: 5, filled: 3, requiredMissing: 0, invalid: 1 })
  })

  it('treats spaces as empty', () => {
    expect(groupState({ items: ['venue'] }, { fields, slots, copy: { venue: '   ' }, photos: new Set() }).requiredMissing).toBe(1)
  })
})

describe('initialOpen', () => {
  it('opens the groups marked open, else the first', () => {
    expect(initialOpen([{ key: 'a', open: false }, { key: 'b', open: true }])).toEqual(['b'])
    expect(initialOpen([{ key: 'a', open: false }, { key: 'b', open: false }])).toEqual(['a'])
    expect(initialOpen([])).toEqual([])
  })
})
