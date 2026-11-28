import { describe, expect, it } from 'vitest'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import type { BatchPhoto } from '../workspace/photo-batch'
import { mergedNote, cellTier, batchTiers } from './cell-choices'
import { withBatchTier, withNote, withNotes, withRemoved, withTiers } from './cell-edits'
import { cellKey, EMPTY_MATRIX, matrixCells } from './matrix-state'
import { groupSummary, initiallyOpen, reviewGroups, samePhoto, sameTemplate } from './review-groups'

const template = (id: string, resolutions: CatalogueTemplate['imageOptions'] extends infer O ? O extends { resolutions: infer R } ? R : never : never = ['1k', '2k', '4k']): CatalogueTemplate => ({
  id, name: id.toUpperCase(), category: 'c', categoryName: 'C', categoryOrder: 0, compare: false, description: null, photoInput: 'required',
  imageOptions: { resolutions, aspectRatios: ['1:1'], originalRatio: true }, creditsCost: { '1k': 1, '2k': 2, '4k': 4 }, copyFields: [], toggles: [],
  cover: { type: 'image', before: null, after: null, motion: null, poster: null },
})
const photo = (id: string): BatchPhoto => ({ id, url: `blob:${id}`, bytes: 1, ratio: null, upload: { phase: 'done', inputKey: `in/${id}` }, name: `${id}.jpg` })
const a = template('a')
const b = template('b', ['1k', '2k'])
const photos = ['p1', 'p2', 'p3'].map(photo)

describe('the tiers a result may pick', () => {
  it('lists the template\'s sold tiers, 1K only with promotion credits', () => {
    expect(batchTiers(a, false)).toEqual(['2k', '4k'])
    expect(batchTiers(b, false)).toEqual(['2k'])
    expect(batchTiers(b, true)).toEqual(['1k', '2k'])
  })
  it('keeps the wanted tier when offered, else the nearest (higher on a tie), else none', () => {
    expect(cellTier('4k', ['2k', '4k'])).toBe('4k')
    expect(cellTier('4k', ['1k', '2k'])).toBe('2k')
    expect(cellTier('2k', ['1k', '4k'])).toBe('4k')
    expect(cellTier('2k', [])).toBeNull()
  })
})

describe('editing results one by one or together', () => {
  it('appends a shared note on its own line, replaces it, or fills an empty one, within 300', () => {
    expect(mergedNote('', '  same table  ', 'append')).toBe('same table')
    expect(mergedNote('less sauce', 'same table', 'append')).toBe('less sauce\nsame table')
    expect(mergedNote('less sauce', 'same table', 'replace')).toBe('same table')
    expect(mergedNote('x'.repeat(299), 'more', 'append')).toHaveLength(300)
  })
  it('touches only the results given', () => {
    const k1 = cellKey('a', 'p1')
    const k2 = cellKey('a', 'p2')
    let v = withNote(EMPTY_MATRIX, k1, 'less sauce')
    v = withNotes(v, [k1, k2], 'same table', 'append')
    expect(v.notes).toEqual({ [k1]: 'less sauce\nsame table', [k2]: 'same table' })
    expect(withNote(v, k2, '').notes).toEqual({ [k1]: 'less sauce\nsame table' })
    v = withTiers(v, [k2], '4k')
    expect(v.tiers).toEqual({ [k2]: '4k' })
    expect(withBatchTier(v, '2k')).toMatchObject({ resolution: '2k', tiers: {} })
    v = withRemoved(v, [k1, k2], true)
    expect(withRemoved(v, [k1], false).removed).toEqual([k2])
  })
})

describe('the review list', () => {
  const values = { ...EMPTY_MATRIX, templateIds: ['a', 'b'], notes: { [cellKey('a', 'p2')]: 'less sauce' }, removed: [cellKey('b', 'p3')] }
  const cells = matrixCells([a, b], photos, values)

  it('groups results by template or by photo, in pick order', () => {
    expect(reviewGroups(cells, photos, 'template').map((g) => [g.id, g.rows.map((r) => r.cell.key)])).toEqual([
      ['a', ['a|p1', 'a|p2', 'a|p3']], ['b', ['b|p1', 'b|p2', 'b|p3']],
    ])
    expect(reviewGroups(cells, photos, 'photo').map((g) => [g.id, g.rows.map((r) => r.cell.key)])).toEqual([
      ['p1', ['a|p1', 'b|p1']], ['p2', ['a|p2', 'b|p2']], ['p3', ['a|p3', 'b|p3']],
    ])
  })
  it('sums up a folded group: what it makes, at which tiers, notes and credits', () => {
    const [first, second] = reviewGroups(cells, photos, 'template')
    expect(groupSummary(first!)).toEqual({ kept: 3, tiers: [['2k', 3]], notes: 1, credits: 6 })
    expect(groupSummary(second!)).toEqual({ kept: 2, tiers: [['2k', 2]], notes: 0, credits: 4 })
  })
  it('opens every group of a short batch, only the first of a long one', () => {
    expect([...initiallyOpen(reviewGroups(cells, photos, 'template'))]).toEqual(['a', 'b'])
    const many = Array.from({ length: 6 }, (_, i) => photo(`x${i}`))
    expect([...initiallyOpen(reviewGroups(matrixCells([a, b], many, values), many, 'template'))]).toEqual(['a'])
  })
  it('finds the results that share a template or a photo, leaving out skipped ones', () => {
    expect(sameTemplate(cells, cellKey('b', 'p1'))).toEqual(['b|p1', 'b|p2'])
    expect(samePhoto(cells, cellKey('a', 'p3'))).toEqual(['a|p3'])
  })
})
