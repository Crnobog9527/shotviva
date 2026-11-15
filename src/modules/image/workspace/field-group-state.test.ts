import { describe, expect, it } from 'vitest'

import type { CatalogueCopyField, CatalogueImageSlot } from '../catalogue/catalogue-template'
import { groupState, initialOpen, namedWithoutPhoto } from './field-group-state'

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

describe('namedWithoutPhoto', () => {
  const prizeFields = [field('venue'), field('prize_1_name'), field('prize_1_note'), field('prize_2_name')]
  const prizeSlots: CatalogueImageSlot[] = [
    { key: 'logo', label: 'Logo', required: false },
    { key: 'prize_1', label: '1st prize photo', required: false, note: 'prize_1_note' },
    { key: 'prize_2', label: '2nd prize photo', required: false },
  ]
  const all = ['venue', 'logo', 'prize_1_name', 'prize_1_note', 'prize_1', 'prize_2_name', 'prize_2']
  const run = (copy: Record<string, string>, photos: string[] = [], keys = all) => namedWithoutPhoto(keys, { fields: prizeFields, slots: prizeSlots, copy, photos: new Set(photos) })

  it('lists the slots whose name is typed and whose photo is empty', () => {
    expect(run({ prize_1_name: 'Whisky', prize_2_name: 'Champagne' })).toEqual(['prize_1', 'prize_2'])
    expect(run({ prize_1_name: 'Whisky', prize_2_name: 'Champagne' }, ['prize_2'])).toEqual(['prize_1'])
  })

  it('is empty once every named slot has a photo, or when no name is typed', () => {
    expect(run({ prize_1_name: 'Whisky' }, ['prize_1'])).toEqual([])
    expect(run({ venue: 'Night Flight', prize_1_name: '  ' })).toEqual([])
    expect(run({}, ['prize_1'])).toEqual([])
  })

  it('pairs by field keys, so a slot without a <key>_name field (a logo) never counts', () => {
    expect(run({ venue: 'Night Flight', prize_1_note: 'amber single malt' })).toEqual([])
  })

  it('looks only at the slots among the given keys (one group)', () => {
    expect(run({ prize_1_name: 'Whisky' }, [], ['venue', 'logo'])).toEqual([])
  })
})
